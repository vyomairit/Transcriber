from langchain_core.prompts import ChatPromptTemplate
from .config import Settings
from .llm import bedrock_llm
from .schemas import Citation
from .embed import load_index

_SYS = (
    "Answer the question using ONLY the transcript context provided. "
    "Cite timestamps in [mm:ss] form when relevant. "
    "If the answer is not in the transcript, say so plainly."
)
 
    
def _ts(seconds:float):
    m,s = divmod(int(seconds), 60)
    return f"{m:02d}:{s:02d}"


def prepare(question: str, job, settings: Settings):
    llm = bedrock_llm(settings)
    k = settings.retriever_top_k
    
    if getattr(job, "has_index", False):
        # ponytail: reconnects Chroma from disk per ask; cache by job_id if latency matters
        vectorstore = load_index(job.job_id, settings)
        docs = vectorstore.similarity_search(question, k=k)
        context = "\n\n".join(
            f"[{_ts(d.metadata['start'])}-{_ts(d.metadata['end'])}] {d.page_content}" for d in docs
        )
        citations = [
            Citation(start=d.metadata["start"], end=d.metadata["end"], text=d.page_content[:160])
            for d in docs
        ]
        mode = "rag"
    else:
        context= job.text
        citations = []
        mode = "stuffed"
        
    prompt = ChatPromptTemplate.from_messages([
        ("system", _SYS),
        ("human", "Context:\n{context}\n\nQuestion: {q}"),
    ])
    return (prompt | llm), {"context": context, "q": question}, citations, mode