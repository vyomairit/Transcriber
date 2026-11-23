from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from .config import Settings
from .llm import bedrock_llm
from .schemas import ChatTurn, Citation
from .embed import load_index

_SYS = (
    "Answer the question using ONLY the transcript context provided. "
    "Cite timestamps in [mm:ss] form when relevant. "
    "If the answer is not in the transcript, say so plainly. "
    "Earlier turns of the conversation are included so you can resolve follow-ups "
    "(\"who owns that?\", \"what about the second one?\"); ground every answer in the transcript context."
)

_CONDENSE_SYS = (
    "Rewrite the user's follow-up question as a single standalone question that can be understood "
    "without the conversation, filling in names, topics and references from the conversation. "
    "If it is already standalone, return it unchanged. Return only the question."
)


def _ts(seconds: float):
    m, s = divmod(int(seconds), 60)
    return f"{m:02d}:{s:02d}"


def _recent(history: list[ChatTurn] | None, settings: Settings) -> list[ChatTurn]:
    turns = [t for t in (history or []) if t.content.strip()]
    return turns[-settings.max_history_turns:] if settings.max_history_turns > 0 else []


def _to_messages(turns: list[ChatTurn], settings: Settings) -> list[BaseMessage]:
    # Real message objects (not ("human", text) tuples) so braces in old answers
    # aren't parsed as prompt-template variables.
    cap = settings.max_history_chars_per_turn
    return [
        (HumanMessage if t.role == "user" else AIMessage)(content=t.content[:cap])
        for t in turns
    ]


def _standalone_question(question: str, turns: list[ChatTurn], llm, settings: Settings) -> str:
    """Turn a follow-up like "who owns it?" into a query that retrieval can actually match."""
    cap = settings.max_history_chars_per_turn
    chat = "\n".join(f"{t.role.upper()}: {t.content[:cap]}" for t in turns)
    prompt = ChatPromptTemplate.from_messages([
        ("system", _CONDENSE_SYS),
        ("human", "Conversation:\n{chat}\n\nFollow-up question: {q}"),
    ])
    rewritten = (prompt | llm).invoke({"chat": chat, "q": question}).text.strip()
    return rewritten or question


def prepare(question: str, job, settings: Settings, history: list[ChatTurn] | None = None):
    """Returns (chain, inputs, citations, mode, search_query)."""
    llm = bedrock_llm(settings)
    k = settings.retriever_top_k
    turns = _recent(history, settings)
    search_query = None

    if getattr(job, "has_index", False):
        # Retrieval sees only the query string, so follow-ups must be made standalone first.
        search_query = _standalone_question(question, turns, llm, settings) if turns else question
        # ponytail: reconnects Chroma from disk per ask; cache by job_id if latency matters
        vectorstore = load_index(job.job_id, settings)
        docs = vectorstore.similarity_search(search_query, k=k)
        context = "\n\n".join(
            f"[{_ts(d.metadata['start'])}-{_ts(d.metadata['end'])}] {d.page_content}" for d in docs
        )
        citations = [
            Citation(start=d.metadata["start"], end=d.metadata["end"], text=d.page_content[:160])
            for d in docs
        ]
        mode = "rag"
    else:
        context = job.text
        citations = []
        mode = "stuffed"

    prompt = ChatPromptTemplate.from_messages([
        ("system", _SYS),
        MessagesPlaceholder("history"),
        ("human", "Context:\n{context}\n\nQuestion: {q}"),
    ])
    inputs = {"context": context, "q": question, "history": _to_messages(turns, settings)}
    return (prompt | llm), inputs, citations, mode, search_query
