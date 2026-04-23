import logging
from typing import List, Optional

from app.config import settings_manager

logger = logging.getLogger(__name__)

_EMBEDDING_DIMENSION = 1024


class EmbeddingService:
    _instance: Optional["EmbeddingService"] = None

    def __init__(self) -> None:
        self._model_name: str = settings_manager.embedding_model
        self._device: str = settings_manager.embedding_device
        self._use_fp16: bool = settings_manager.embedding_use_fp16
        self._model = None

    @classmethod
    def get_instance(cls) -> "EmbeddingService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load_model(self) -> None:
        if self._model is not None:
            return

        from FlagEmbedding import BGEM3FlagModel

        devices = [self._device]

        try:
            logger.info(
                "Loading embedding model %s on %s (fp16=%s)",
                self._model_name, self._device, self._use_fp16,
            )
            self._model = BGEM3FlagModel(
                self._model_name, use_fp16=self._use_fp16, devices=devices,
            )
            logger.info("Embedding model loaded on %s", self._device)
        except Exception as exc:
            logger.warning("Failed to load model on %s: %s — falling back to CPU", self._device, exc)
            try:
                import torch
                if not torch.cuda.is_available():
                    logger.info("CUDA not available, using CPU")
            except ImportError:
                pass

            self._model = BGEM3FlagModel(
                self._model_name, use_fp16=False, devices=["cpu"],
            )
            self._device = "cpu"
            self._use_fp16 = False
            logger.info("Embedding model loaded on CPU (fp16 disabled)")

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        self._load_model()
        try:
            output = self._model.encode(
                texts, return_dense=True, return_sparse=False, return_colbert_vecs=False,
            )
            dense_vecs = output["dense_vecs"]
            return dense_vecs.tolist()
        except Exception as exc:
            logger.error("Embedding encoding failed: %s", exc)
            raise RuntimeError(f"Embedding encoding failed: {exc}") from exc

    def embed_query(self, text: str) -> List[float]:
        results = self.embed_texts([text])
        return results[0]

    def get_embedding_dimension(self) -> int:
        return _EMBEDDING_DIMENSION

    def unload(self) -> None:
        if self._model is not None:
            del self._model
            self._model = None
            logger.info("Embedding model unloaded, GPU memory released")

    def __repr__(self) -> str:
        return (
            f"EmbeddingService(model={self._model_name!r}, "
            f"device={self._device!r}, dim={_EMBEDDING_DIMENSION})"
        )
