import { useSearchParams } from "react-router-dom";

// A single URL-backed value keeps page controls, sidebar shortcuts, and
// browser Back/Forward navigation in sync. Unknown values show all records.
export function useNavigationFilter<T extends string>(
  key: string,
  values: readonly T[],
  fallback: T,
) {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = values.find((option) => option === raw) ?? fallback;

  function setValue(next: T) {
    setParams((current) => {
      const updated = new URLSearchParams(current);
      if (next === fallback) updated.delete(key);
      else updated.set(key, next);
      return updated;
    });
  }

  return [value, setValue] as const;
}
