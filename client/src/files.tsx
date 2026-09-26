import { Icon } from "./icons";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, date, useData, type Doc } from "./api";
import {
  Empty,
  ErrorBox,
  Field,
  Header,
  Loading,
  SaveForm,
} from "./components";
const purposeNames: Record<string, string> = {
  color: "색상별 JPG",
  overview: "전체 색상 모음 JPG",
  psd: "PSD 원본",
};
export function Files() {
  const [params, setParams] = useSearchParams();
  const groupId = params.get("group_id") || "";
  const purpose = params.get("purpose") || "color";
  const state = useData<Doc[]>(
    `/files?group_id=${groupId}&purpose=${purpose}&q=${encodeURIComponent(params.get("q") || "")}`,
    [],
  );
  const { data: groups } = useData<Doc[]>("/groups", []);
  const [upload, setUpload] = useState(false),
    [form, setForm] = useState({ group_id: groupId, purpose, color: "" }),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState("");
  const { data: selectedGroup, reload: reloadGroup } = useData<Doc | null>(
    form.group_id ? `/groups/${form.group_id}` : "/groups",
    null,
  );
  useEffect(() => {
    if (!file || form.purpose === "psd") {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, form.purpose]);
  const existing = selectedGroup?.files?.find(
    (f: Doc) => f.purpose === form.purpose && f.color === form.color,
  );
  const colors = Array.from(
    new Set<string>(selectedGroup?.products?.map((p: Doc) => p.color) || []),
  );
  return (
    <>
      <Header
        title="컬러칩·PSD"
        description="현재 사용하는 자료를 확인하고 등록 원본을 다운로드합니다."
        action={
          <button
            className="primary"
            onClick={() => {
              setForm({ group_id: groupId, purpose, color: "" });
              setUpload(true);
            }}
          >
            <Icon name="plus" size={18} /> 자료 업로드
          </button>
        }
      />
      {upload && (
        <section className="panel form-panel">
          <h2>자료 업로드</h2>
          <SaveForm
            dirty={!!file}
            onSave={async () => {
              if (!file) throw new Error("파일을 선택하세요.");
              if (
                existing &&
                form.purpose !== "psd" &&
                !window.confirm(
                  `${existing.name} 파일을 ${file.name}(으)로 교체할까요?`,
                )
              )
                return false;
              const body = new FormData();
              body.set("file", file);
              Object.entries(form).forEach(([k, v]) => body.set(k, v));
              if (existing && form.purpose !== "psd")
                body.set("replace_id", existing.id);
              await api("/files", { method: "POST", body });
              setUpload(false);
              setFile(null);
              state.reload();
              reloadGroup();
            }}
            cancel={() => setUpload(false)}
            label={
              existing && form.purpose !== "psd"
                ? "현재 파일 교체"
                : "파일 저장"
            }
          >
            <div className="form-grid">
              <Field
                name="file-group"
                label="연결 기술서"
                required
                value={form.group_id}
                onChange={(group_id) =>
                  setForm({ ...form, group_id, color: "" })
                }
                options={groups.map((g) => ({
                  value: g.id,
                  label: `${g.design} · ${g.product_type}`,
                }))}
              />
              <Field
                name="file-purpose"
                label="용도"
                value={form.purpose}
                required
                onChange={(purpose) => {
                  setForm({ ...form, purpose, color: "" });
                  setFile(null);
                }}
                options={Object.entries(purposeNames).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
              {form.purpose !== "overview" && (
                <Field
                  name="file-color"
                  label={
                    form.purpose === "psd"
                      ? "색상 (선택하지 않으면 기술서 공통)"
                      : "연결 색상"
                  }
                  required={form.purpose === "color"}
                  value={form.color}
                  onChange={(color) => setForm({ ...form, color })}
                  options={colors.map((c) => ({ value: c, label: c }))}
                />
              )}
            </div>
            <label className="upload-zone">
              파일 선택
              <input
                key={form.purpose}
                type="file"
                accept={form.purpose === "psd" ? ".psd" : ".jpg,.jpeg"}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <span>
                {form.purpose === "psd"
                  ? "PSD 최대 500MB · 미리보기 없이 원본 보관"
                  : "JPG/JPEG 최대 20MB · 사이즈 공통"}
              </span>
            </label>
            <div className="preview-comparison">
              {existing && form.purpose !== "psd" && (
                <figure>
                  <figcaption>현재 파일 · {existing.name}</figcaption>
                  <img
                    src={`/api/files/${existing.id}/preview`}
                    alt="현재 컬러칩"
                  />
                </figure>
              )}
              {preview && (
                <figure>
                  <figcaption>새 파일 · {file?.name}</figcaption>
                  <img src={preview} alt="업로드 전 새 컬러칩 확인" />
                </figure>
              )}
            </div>
          </SaveForm>
        </section>
      )}
      <section className="panel">
        <div className="segmented">
          {Object.entries(purposeNames).map(([key, label]) => (
            <button
              aria-pressed={purpose === key}
              key={key}
              onClick={() =>
                setParams({ ...Object.fromEntries(params), purpose: key })
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="filters">
          <label className="search">
            <span>자료 검색</span>
            <input
              value={params.get("q") || ""}
              placeholder="디자인·색상·파일명 검색"
              onChange={(e) =>
                setParams(
                  { ...Object.fromEntries(params), q: e.target.value },
                  { replace: true },
                )
              }
            />
          </label>
          <label>
            <span>연결 기술서</span>
            <select
              value={groupId}
              onChange={(e) =>
                setParams({
                  ...Object.fromEntries(params),
                  group_id: e.target.value,
                })
              }
            >
              <option value="">전체 기술서</option>
              {groups.map((g) => (
                <option value={g.id} key={g.id}>
                  {g.design} · {g.product_type}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ErrorBox message={state.error} retry={state.reload} />
        {state.loading ? (
          <Loading />
        ) : !state.data.length ? (
          <Empty>이 조건에 등록된 {purposeNames[purpose]}가 없습니다.</Empty>
        ) : (
          <div className="asset-grid">
            {state.data.map((f) => (
              <article className="asset" key={f.id}>
                {f.purpose !== "psd" ? (
                  <a href={`/api/files/${f.id}/download`}>
                    <img
                      loading="lazy"
                      src={`/api/files/${f.id}/preview`}
                      alt={`${f.design} ${f.product_type} ${f.color} ${purposeNames[f.purpose]}`}
                    />
                  </a>
                ) : (
                  <div className="psd-icon" aria-hidden>
                    <Icon name="file" size={40} />
                    <span>PSD</span>
                  </div>
                )}
                <div className="asset-body">
                  <span className="badge">{purposeNames[f.purpose]}</span>
                  <h3>
                    {f.design} · {f.color || "전체 색상"}
                  </h3>
                  <p>{f.product_type}</p>
                  <p className="filename">{f.name}</p>
                  <small>
                    {date(f.created_at)} · {(f.size / 1024 / 1024).toFixed(1)}MB
                  </small>
                  <a className="button" href={`/api/files/${f.id}/download`}>
                    {f.purpose === "psd" ? "PSD" : "JPG"} 원본 다운로드
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
