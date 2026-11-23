from langchain_core.prompts import ChatPromptTemplate
from langchain_text_splitters import RecursiveCharacterTextSplitter

from .config import Settings
from .llm import bedrock_llm

_STYLE = {
    "bullets": "Summarize the transcript as concise bullet points.",
    "paragraph": "Summarize the transcript in one or two tight paragraphs.",
    "action_items": "Extract concrete action items, noting the owner when one is mentioned.",
}

    
def _estimate_tokens(text:str): return len(text.strip())//4

def summarize(text:str, style:str, instructions: str|None, settings: Settings):
    llm = bedrock_llm(settings)
    hint = _STYLE.get(style, _STYLE["bullets"])
    extra = f"\nAdditional instructions:{instructions}" if instructions else ""
    budget = int(settings.num_ctx*0.6)
    
    if _estimate_tokens(text) <= budget:
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You summarize audio transcripts faithfully. Never invent facts."),
            ("human", "{hint}{extra}\n\nTranscript:\n{text}"),
        ])
        out = (prompt | llm).invoke({"hint": hint, "extra": extra, "text": text})
        return out.text, "single_shot"
    return _map_reduce(text, hint, extra, llm, settings), "map_reduce"

def _map_reduce(text: str, hint: str, extra:str, llm, settings: Settings):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size = int(settings.num_ctx*0.5)*4,
        chunk_overlap = settings.chunk_overlap_chars
    )
    chunks = splitter.split_text(text)
    
    map_chain = ChatPromptTemplate.from_messages([
        ("system", "Summarize this transcript chunk faithfully in a few sentences."),
        ("human", "{chunk}"),
    ]) | llm
    
    partials = [map_chain.invoke({"chunk": c}).text for c in chunks]
    reduce_chain = ChatPromptTemplate.from_messages([
        ("system", "Combine these partial summaries into one coherent result. Never invent facts."),
        ("human", "{hint}{extra}\n\nPartial summaries:\n{joined}"),
    ]) | llm
    
    joined = "\n\n".join(f"- {p}" for p in partials)
    return reduce_chain.invoke({"hint": hint, "extra": extra, "joined": joined}).text