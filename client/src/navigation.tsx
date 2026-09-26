import {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useBlocker } from "react-router-dom";
export const DirtyContext = createContext<(id: string, dirty: boolean) => void>(
  () => {},
);
export function NavigationGuard({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const register = useCallback(
    (id: string, value: boolean) =>
      setDirty((current) => {
        if (!!current[id] === value) return current;
        const next = { ...current };
        if (value) next[id] = true;
        else delete next[id];
        return next;
      }),
    [],
  );
  const changed = Object.keys(dirty).length > 0;
  const blocker = useBlocker(changed);
  useEffect(() => {
    if (!changed) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [changed]);
  return (
    <DirtyContext.Provider value={register}>
      {children}
      {blocker.state === "blocked" && (
        <div className="navigation-warning" role="alert">
          <strong>저장하지 않은 변경사항이 있습니다.</strong>
          <p>이동하면 입력한 내용을 잃을 수 있습니다.</p>
          <button onClick={() => blocker.reset()}>계속 편집</button>{" "}
          <button onClick={() => blocker.proceed()}>변경사항 버리기</button>
        </div>
      )}
    </DirtyContext.Provider>
  );
}
