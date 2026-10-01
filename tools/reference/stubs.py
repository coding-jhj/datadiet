"""Deterministic stand-ins for the heavy imports of select_data.py.

The paper's selection code imports datasets, transformers, sentence_transformers
and sklearn at module level. None of them is needed to test the selection
logic itself, so we replace them with tiny deterministic fakes and run the
UNMODIFIED select_data.py on top. The JS test-suite re-implements exactly the
same fakes (tests/support/stubs.ts).

Stub definitions (must stay in sync with tests/support/stubs.ts):

  token count of a message list
      3 + sum(4 + 6 * (content.count(" ") + 1) for each message)
  embedding of a text (dim 8)
      digest = sha256(text.encode("utf-8")); v[i] = digest[i]/255 - 0.5;
      then divide by sqrt(sum(v[i]*v[i])) with a sequential sum
  cluster label of an embedding x for k clusters and random_state s
      (floor((x[0] + 1.0) * 0.5 * k) + s) % k
"""

from __future__ import annotations

import hashlib
import math
import sys
import types

import numpy as np

SYNTH_DATA: dict[str, list[dict]] = {}


def stub_token_count(messages: list[dict]) -> int:
    total = 3
    for message in messages:
        total += 4 + 6 * (message["content"].count(" ") + 1)
    return total


def stub_embedding(text: str) -> list[float]:
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    vector = [digest[i] / 255.0 - 0.5 for i in range(8)]
    squared = 0.0
    for value in vector:
        squared += value * value
    norm = math.sqrt(squared)
    return [value / norm for value in vector]


def stub_label(first_component: float, k: int, random_state: int) -> int:
    return (int(math.floor((first_component + 1.0) * 0.5 * k)) + random_state) % k


class _StubTokenizer:
    def apply_chat_template(self, batch, tokenize=True, add_generation_prompt=False):
        if batch and isinstance(batch[0], dict):
            return {"input_ids": [0] * stub_token_count(batch)}
        return {"input_ids": [[0] * stub_token_count(messages) for messages in batch]}


class _AutoTokenizer:
    @staticmethod
    def from_pretrained(*_args, **_kwargs):
        return _StubTokenizer()


class _SentenceTransformer:
    def __init__(self, *_args, **_kwargs):
        pass

    def encode(self, texts, batch_size=32, normalize_embeddings=True, show_progress_bar=False):
        return np.array([stub_embedding(text) for text in texts], dtype=np.float64)


class _MiniBatchKMeans:
    def __init__(self, n_clusters, random_state=None, n_init=3, batch_size=256):
        self.n_clusters = n_clusters
        self.random_state = random_state

    def fit_predict(self, X):
        return np.array(
            [stub_label(float(row[0]), self.n_clusters, int(self.random_state)) for row in X],
            dtype=np.int64,
        )


def _load_dataset(dataset_id, config, split="train", streaming=True, revision=None):
    return iter(SYNTH_DATA[config])


def install() -> None:
    datasets = types.ModuleType("datasets")
    datasets.load_dataset = _load_dataset
    transformers = types.ModuleType("transformers")
    transformers.AutoTokenizer = _AutoTokenizer
    sentence_transformers = types.ModuleType("sentence_transformers")
    sentence_transformers.SentenceTransformer = _SentenceTransformer
    sklearn = types.ModuleType("sklearn")
    sklearn_cluster = types.ModuleType("sklearn.cluster")
    sklearn_cluster.MiniBatchKMeans = _MiniBatchKMeans
    sklearn.cluster = sklearn_cluster
    sys.modules.update(
        {
            "datasets": datasets,
            "transformers": transformers,
            "sentence_transformers": sentence_transformers,
            "sklearn": sklearn,
            "sklearn.cluster": sklearn_cluster,
        }
    )
