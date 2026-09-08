import { Mic, Send, Square } from "lucide-react";
import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import { captureProductEvent } from "../analytics";

interface ComposerProps {
  disabled: boolean;
  onSend(message: string): Promise<void>;
}

export function Composer({ disabled, onSend }: ComposerProps) {
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const message = value.trim();
    if (!message || disabled) return;
    setValue("");
    try {
      await onSend(message);
    } catch {
      setValue(message);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Constructor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Constructor) return;
    const recognition = new Constructor();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setValue((current) => `${current}${current ? " " : ""}${transcript}`);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    captureProductEvent("voice_started");
    recognition.start();
  }

  const voiceAvailable = Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        aria-label="Message Near"
        placeholder="Message Near"
        rows={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
      />
      {voiceAvailable ? (
        <button type="button" className={listening ? "icon-button icon-button--active" : "icon-button"} onClick={toggleVoice} aria-label={listening ? "Stop listening" : "Dictate message"}>
          {listening ? <Square aria-hidden="true" size={18} /> : <Mic aria-hidden="true" size={22} />}
        </button>
      ) : null}
      <button type="submit" className="send-button" disabled={disabled || !value.trim()} aria-label="Send message">
        <Send aria-hidden="true" size={23} />
      </button>
    </form>
  );
}
