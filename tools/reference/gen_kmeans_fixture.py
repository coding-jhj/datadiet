"""Fixture for the statistical kmeans parity test: sklearn MiniBatchKMeans on synthetic embeddings."""
import json, math
import numpy as np
from sklearn.cluster import MiniBatchKMeans

out = []
for case, (n, dim, blobs, seed) in enumerate([(120, 16, 8, 1), (300, 32, 14, 2), (600, 32, 20, 3)]):
    rng = np.random.default_rng(seed)
    centers = rng.normal(size=(blobs, dim))
    x = centers[rng.integers(0, blobs, n)] * 0.8 + rng.normal(size=(n, dim)) * 0.7
    x /= np.linalg.norm(x, axis=1, keepdims=True)
    k = min(n, max(2, round(math.sqrt(n))))
    runs = []
    for s in (13, 42, 2026):
        m = MiniBatchKMeans(n_clusters=k, random_state=s, n_init=3, batch_size=min(256, n))
        labels = m.fit_predict(x)
        runs.append({"seed": s, "labels": labels.tolist(), "inertia": float(m.inertia_)})
    out.append({"points": np.round(x, 8).tolist(), "k": k, "runs": runs})
json.dump(out, open("tests/golden/kmeans.json", "w"))
print("ok", [len(c["points"]) for c in out])
