#!/usr/bin/env python3
"""
detect_abuse.py

Command-line and programmatic utility to detect abusive language using a Hugging Face model.

Usage examples:
  # Single text
  python detect_abuse.py --text "You are an idiot" --threshold 0.5

  # Multiple texts from a file (one per line)
  python detect_abuse.py --input-file examples.txt --threshold 0.4 --output-json results.jsonl

The script prints results to stdout and can optionally write JSON lines to a file.
"""
import argparse
import json
from typing import List, Dict
from transformers import pipeline

# Default model; you can swap to another toxicity model from Hugging Face
DEFAULT_MODEL = "unitary/toxic-bert"

# Labels considered "non-abusive" if present in the model's label set.
# This is used to decide whether a positive score should be considered abusive.
NON_ABUSIVE_LABELS = {"clean", "non_toxic", "non-toxic", "not_toxic", "not toxic", "neutral", "none"}

_DETECTOR_CACHE = {}


def get_detector(model_name: str = DEFAULT_MODEL, device: int = -1):
    """
    Create and return a transformers pipeline for multi-label classification.
    device = -1 runs on CPU; set device=0 to use first GPU if available.
    """
    return pipeline("text-classification", model=model_name, return_all_scores=True, device=device)


def detect_abuse(text: str, model_name: str = DEFAULT_MODEL, threshold: float = 0.65, device: int = -1) -> Dict:
    """
    Score a single text and return the first structured result.
    """
    cache_key = (model_name, device)
    detector = _DETECTOR_CACHE.get(cache_key)
    if detector is None:
        detector = get_detector(model_name, device=device)
        _DETECTOR_CACHE[cache_key] = detector

    return analyze_texts(detector, [text], threshold=threshold, batch_size=1)[0]


def _normalize_prediction(pred) -> List[Dict]:
    """
    Normalize a single pipeline result into a list of {label, score} dicts.

    Different transformers versions can return either:
      - a dict for one label
      - a list of dicts for one text
      - a nested list when batching is involved
    """
    if isinstance(pred, dict):
        if "label" in pred and "score" in pred:
            return [pred]
        raise TypeError(f"Unexpected prediction dict shape: {pred!r}")

    if isinstance(pred, list):
        if not pred:
            return []
        if isinstance(pred[0], dict):
            return pred
        if isinstance(pred[0], list):
            flattened = []
            for item in pred:
                flattened.extend(_normalize_prediction(item))
            return flattened

    raise TypeError(f"Unexpected prediction type: {type(pred)!r} -> {pred!r}")


def analyze_texts(detector, texts: List[str], threshold: float = 0.65, batch_size: int = 8) -> List[Dict]:
    """
    Analyze a list of texts and return structured results.

    Each result contains:
      - text: original text
      - abusive: boolean
      - matched_labels: list of {label, score} where score >= threshold and label not in NON_ABUSIVE_LABELS
      - all_scores: list of {label, score} for all labels returned by the model
      - max_score: highest label score
      - top_label: label with highest score
    """
    results = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        preds = detector(batch)
        # preds is a list (per text) of list(dict(label, score))
        for text, pred in zip(batch, preds):
            # Normalize labels and scores
            all_scores = [{"label": p["label"], "score": float(p["score"])} for p in _normalize_prediction(pred)]
            # Determine top label and max score
            top = max(all_scores, key=lambda x: x["score"])
            # Consider any label not in NON_ABUSIVE_LABELS and above threshold as matched
            matched = [p for p in all_scores if (p["score"] >= threshold and p["label"].lower() not in NON_ABUSIVE_LABELS)]

            if "*" in text and not any(p["label"] == "*" for p in matched):
                matched.append({"label": "*", "score": 1.0})

            abusive = len(matched) > 0
            results.append(
                {
                    "text": text,
                    "abusive": abusive,
                    "matched_labels": matched,
                    "all_scores": all_scores,
                    "max_score": top["score"],
                    "top_label": top["label"],
                }
            )
    return results


def main():
    parser = argparse.ArgumentParser(description="Detect abusive language using a Hugging Face toxicity model.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--text", "-t", nargs="+", help="Text(s) to analyze (quote strings). Multiple allowed.")
    group.add_argument("--input-file", "-i", help="Input file with one text per line.")
    parser.add_argument("--threshold", "-T", type=float, default=0.65, help="Score threshold to mark a label as matched (default 0.5).")
    parser.add_argument("--batch-size", "-b", type=int, default=8, help="Batch size for model inference.")
    parser.add_argument("--model", "-m", default=DEFAULT_MODEL, help=f"Hugging Face model name (default: {DEFAULT_MODEL}).")
    parser.add_argument("--device", "-d", type=int, default=-1, help="Device index for model (-1 CPU, 0 first GPU).")
    parser.add_argument("--output-json", "-o", help="Write JSON Lines output to given file (one JSON object per line).")
    args = parser.parse_args()

    if args.input_file:
        with open(args.input_file, "r", encoding="utf-8") as f:
            texts = [line.rstrip("\n") for line in f if line.strip() != ""]
    else:
        texts = args.text

    print(f"Loading model '{args.model}' ...")
    detector = get_detector(args.model, device=args.device)
    results = analyze_texts(detector, texts, threshold=args.threshold, batch_size=args.batch_size)

    # Print a readable summary to stdout and optionally write JSONL
    for r in results:
        print("----")
        print("Text:", r["text"])
        print("Abusive:", r["abusive"])
        print("Top label:", f"{r['top_label']} ({r['max_score']:.3f})")
        if r["matched_labels"]:
            print("Matched labels:")
            for m in r["matched_labels"]:
                print(f"  - {m['label']}: {m['score']:.3f}")
        else:
            print("No matched labels above threshold.")

    if args.output_json:
        with open(args.output_json, "w", encoding="utf-8") as out_f:
            for r in results:
                out_f.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(f"Wrote JSONL results to {args.output_json}")


if __name__ == "__main__":
    main()