import { useCallback, useRef } from "react";

type CompositionOptions<T extends HTMLElement> = {
  onKeyDown?: (event: React.KeyboardEvent<T>) => void;
  onCompositionStart?: (event: React.CompositionEvent<T>) => void;
  onCompositionEnd?: (event: React.CompositionEvent<T>) => void;
};

export function useComposition<T extends HTMLElement>(options: CompositionOptions<T>) {
  const composing = useRef(false);
  return {
    onCompositionStart: useCallback((event: React.CompositionEvent<T>) => { composing.current = true; options.onCompositionStart?.(event); }, [options]),
    onCompositionEnd: useCallback((event: React.CompositionEvent<T>) => { composing.current = false; options.onCompositionEnd?.(event); }, [options]),
    onKeyDown: useCallback((event: React.KeyboardEvent<T>) => { if ((event.nativeEvent as KeyboardEvent).isComposing || composing.current) { if (event.key === "Enter") return; } options.onKeyDown?.(event); }, [options]),
  };
}
