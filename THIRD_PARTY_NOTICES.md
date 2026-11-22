# Third-party notices

The packaged extension (`real-deal-vX.Y.Z.zip`) bundles the following components.

| Component | Used for | License |
|---|---|---|
| [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) (quantized ONNX conversion by [Xenova](https://huggingface.co/Xenova/all-MiniLM-L6-v2)) | Sentence embeddings | Apache-2.0 |
| [@huggingface/transformers](https://github.com/huggingface/transformers.js) (Transformers.js) | Running the model in the browser | Apache-2.0 |
| [onnxruntime-web](https://github.com/microsoft/onnxruntime) | WebAssembly inference runtime | MIT |
| [Preact](https://github.com/preactjs/preact) | Side panel UI | MIT |
| [idb](https://github.com/jakearchibald/idb) | IndexedDB wrapper | ISC |

The full license texts are available at the links above and in each package's `LICENSE` file in `node_modules`.
Real Deal itself is released under the MIT License (see `LICENSE`).

**Gemini Nano** is not bundled. When available, it is provided by Google Chrome itself and is subject to
Google's terms, including the
[Generative AI Prohibited Uses Policy](https://policies.google.com/terms/generative-ai/use-policy).

**Data.** The research notebook uses the Amazon Reviews 2023 dataset (McAuley Lab), which is not
redistributed here: Hou, Y., Li, J., He, Z., Yan, A., Chen, X. & McAuley, J. (2024). *Bridging Language and
Items for Retrieval and Recommendation.* arXiv:2403.03952.
