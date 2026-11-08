# Local AI model (sentence similarity)

`Xenova/all-MiniLM-L6-v2/` — the open-source **all-MiniLM-L6-v2** sentence
embedding model (Apache-2.0 licence; original by sentence-transformers,
ONNX conversion by Xenova on Hugging Face), 8-bit quantized (~22 MB).

Used by Client Care (`api/_helpers/care/similarity.ts`) to:
- pick a revision note's category (closest category description), and
- merge similar notes into a client's SOP rules.

It runs **inside the app** through `@huggingface/transformers` — no external
AI service, no API key, no per-use cost. Remote downloads are disabled at
runtime: only these files are used. If the model can't load, the app falls
back to free word matching automatically.
