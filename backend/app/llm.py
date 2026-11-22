"""LLM access through Agno. Works with Groq, Gemini, OpenAI or Anthropic. Everything degrades gracefully when no key is set."""
from __future__ import annotations

import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from typing import Type, TypeVar

from dotenv import load_dotenv
from pydantic import BaseModel

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"  # backend/.env, found no matter where you start the server from
load_dotenv(ENV_PATH)

T = TypeVar("T", bound=BaseModel)

# provider -> (env vars that can hold the key, default model id). Override the model with LLM_MODEL in .env.
PROVIDERS = {
    "groq": (("GROQ_API_KEY",), "openai/gpt-oss-120b"),
    "gemini": (("GOOGLE_API_KEY", "GEMINI_API_KEY"), "gemini-2.5-flash"),
    "openai": (("OPENAI_API_KEY",), "gpt-4.1-mini"),
    "anthropic": (("ANTHROPIC_API_KEY",), "claude-haiku-5-5"),
}


def _key(provider: str) -> str | None:
    for env in PROVIDERS[provider][0]:
        value = (os.getenv(env) or "").strip().strip("'\"")
        if value:
            return value
    return None


PACKAGES = {"groq": "groq", "gemini": "google-genai", "openai": "openai", "anthropic": "anthropic"}


def explain_error(text: str) -> str:
    """Turn a provider error into a short, safe reason. The raw text is never shown, since it can echo parts of a key."""
    t = (text or "").lower()
    if any(w in t for w in ("401", "403", "invalid api key", "incorrect api key", "authentication", "permission", "api key not valid", "unauthorized")):
        return "The provider rejected the API key. Check it is correct, active and for this provider"
    if any(w in t for w in ("429", "rate limit", "quota", "resource_exhausted", "too many requests")):
        return "Rate limit or quota reached. Wait a minute or use another model or provider"
    if any(w in t for w in ("404", "not found", "decommissioned", "does not exist", "model_not_found", "no longer supported")):
        return "The model name was not accepted. Set LLM_MODEL in backend/.env to a model your account can use"
    if any(w in t for w in ("connection", "timed out", "timeout", "name resolution", "ssl", "unreachable")):
        return "Cannot reach the provider. Check your internet, VPN or firewall"
    return "The AI call failed for another reason. Run check_ai.py to see the details"


class LLMUnavailable(Exception):
    """Raised with a short, user-safe reason when the LLM cannot be used."""


def _pick_provider() -> str | None:
    wanted = os.getenv("LLM_PROVIDER", "").strip().lower()
    if wanted:
        return wanted if wanted in PROVIDERS and _key(wanted) else None
    for name in PROVIDERS:  # auto-detect in the order above
        if _key(name):
            return name
    return None


class LLM:
    def __init__(self) -> None:
        self.provider = _pick_provider()
        self.model_id = os.getenv("LLM_MODEL") or (PROVIDERS[self.provider][1] if self.provider else "")
        self.timeout = float(os.getenv("LLM_TIMEOUT_SECONDS", "45"))

    @property
    def enabled(self) -> bool:
        return self.provider is not None

    def hint(self) -> str | None:
        """Why the AI is off, in plain words. Never includes the key itself."""
        if self.enabled:
            return None
        wanted = os.getenv("LLM_PROVIDER", "").strip().lower()
        if wanted:
            return f"LLM_PROVIDER is '{wanted}' but no key was found for it (or the name is not one of: {', '.join(PROVIDERS)})."
        if not ENV_PATH.exists():
            return f"No .env file at {ENV_PATH}. The file name must be exactly .env (not .env.txt)."
        names = ", ".join(e for envs, _ in PROVIDERS.values() for e in envs)
        return f"The .env file was found but none of these has a value: {names}."

    def info(self) -> dict:
        return {
            "enabled": self.enabled,
            "provider": self.provider,
            "model": self.model_id if self.enabled else None,
            "hint": self.hint(),
        }

    def _model(self):
        if self.provider == "groq":
            from agno.models.groq import Groq
            return Groq(id=self.model_id, api_key=_key("groq"), timeout=self.timeout, max_retries=1)
        if self.provider == "gemini":
            from agno.models.google import Gemini
            return Gemini(id=self.model_id, api_key=_key("gemini"), timeout=self.timeout)
        if self.provider == "openai":
            from agno.models.openai import OpenAIChat
            return OpenAIChat(id=self.model_id, api_key=_key("openai"), timeout=self.timeout, max_retries=1)
        if self.provider == "anthropic":
            from agno.models.anthropic import Claude
            return Claude(id=self.model_id, api_key=_key("anthropic"), timeout=self.timeout)
        raise LLMUnavailable("No API key is set")

    def _run(self, name: str, instructions: str, prompt: str, schema: Type[BaseModel] | None):
        from agno.agent import Agent

        agent = Agent(
            name=name,
            model=self._model(),
            instructions=instructions,
            output_schema=schema,
            use_json_mode=schema is not None,
            markdown=False,
        )
        out = agent.run(prompt)
        # Agno catches model errors and returns them as content, so check the status explicitly.
        if str(getattr(out.status, "value", out.status)).lower() == "error":
            raise RuntimeError(explain_error(str(out.content)))
        return out.content

    def _call(self, name: str, instructions: str, prompt: str, schema: Type[BaseModel] | None):
        if not self.enabled:
            raise LLMUnavailable("No API key is set")
        pool = ThreadPoolExecutor(max_workers=1)
        future = pool.submit(self._run, name, instructions, prompt, schema)
        try:
            return future.result(timeout=self.timeout + 15)
        except FutureTimeout as exc:
            raise LLMUnavailable("The AI took too long to answer") from exc
        except ImportError as exc:
            raise LLMUnavailable(f"A package is missing. Run: uv add {PACKAGES.get(self.provider, 'agno')}") from exc
        except RuntimeError as exc:  # already translated by explain_error
            raise LLMUnavailable(str(exc)) from exc
        except Exception as exc:
            raise LLMUnavailable(explain_error(f"{exc.__class__.__name__} {exc}")) from exc
        finally:
            pool.shutdown(wait=False)

    def structured(self, name: str, instructions: str, prompt: str, schema: Type[T]) -> T:
        out = self._call(name, instructions, prompt, schema)
        if isinstance(out, schema):
            return out
        try:
            return schema.model_validate(out) if isinstance(out, dict) else schema.model_validate_json(str(out))
        except Exception as exc:
            raise LLMUnavailable("The AI returned an unusable plan") from exc

    def text(self, name: str, instructions: str, prompt: str) -> str:
        out = self._call(name, instructions, prompt, None)
        text = str(out or "").strip()
        if not text:
            raise LLMUnavailable("The AI returned an empty answer")
        return text


_llm: LLM | None = None


def get_llm() -> LLM:
    global _llm
    if _llm is None:
        _llm = LLM()
    return _llm