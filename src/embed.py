from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_ollama import OllamaEmbeddings

from .config import Settings
from .schemas import Segment

def _embeddings(settings: Settings) -> OllamaEmbeddings:
    return OllamaEmbeddings(model=settings.embed_model, base_url=settings.ollama_base_url)

def build_index(segments: list[Segment], settings: Settings, collection_name: str) -> Chroma:
    docs = _segment_chunks(segments, settings)
    return Chroma.from_documents(
        docs, _embeddings(settings),
        collection_name=collection_name,
        persist_directory=settings.chroma_dir,
    )

def load_index(collection_name: str, settings: Settings) -> Chroma:
    return Chroma(
        collection_name=collection_name,
        embedding_function=_embeddings(settings),
        persist_directory=settings.chroma_dir,
    )

def _segment_chunks(segments: list[Segment], settings: Settings) -> list[Document]:
    docs: list[Document] = []
    buf: list[Segment] = []
    buf_len = 0
    for seg in segments:
        buf.append(seg)
        buf_len += len(seg.text)
        if buf_len >= settings.chunk_target_chars:
            docs.append(_flush(buf))
            buf, buf_len = _overlap_tail(buf, settings.chunk_overlap_chars)
    if buf:
        docs.append(_flush(buf))
    return docs

def _flush(buf: list[Segment]) -> Document:
    return Document(
        page_content=" ".join(s.text for s in buf),
        metadata={"start": buf[0].start, "end": buf[-1].end},
    )
 
def _overlap_tail(buf: list[Segment], overlap_chars: int) -> tuple[list[Segment], int]:
    tail: list[Segment] = []
    total = 0
    for seg in reversed(buf):
        tail.insert(0, seg)
        total += len(seg.text)
        if total >= overlap_chars:
            break
    return tail, total