import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Code2, Columns2, Eye, Monitor, RefreshCw, Smartphone } from "lucide-react";
import { usePreview } from "../hooks/usePreview";
import { previewPageUrl } from "../lib/preview";
import type { Job } from "../lib/types";
import ErrorAlert from "./ErrorAlert";
type Layout = "compare" | "before" | "after";
type Device = "desktop" | "mobile";

function PreviewFrame({title, url, device, updated, refreshKey}: { title: string; url: string; device: Device; updated: boolean; refreshKey: number }) {
  const frameBox = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(540);
  useEffect(() => {
    const element = frameBox.current;
    if (!element) return;
    const update = () => { if(element.clientWidth) setAvailableWidth(element.clientWidth); };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const width = device === "mobile" ? 390 : 1280;
  const height = device === "mobile" ? 844 : 820;
  const scale = Math.min(availableWidth / width, 1);
  return <section className={"preview-browser" + (updated ? " preview-browser-updated" : "")} aria-label={title + " preview"}>
    <div className="preview-browser-bar"><div className="browser-dots" aria-hidden="true"><i/><i/><i/></div><strong>{title}</strong><span>{updated ? "Proposed change" : "Original repository"}</span></div>
    <div className="preview-stage" ref={frameBox} style={{height: height * scale}}>
      <iframe key={url + refreshKey} title={title + " repository UI"} src={url} sandbox="allow-scripts" referrerPolicy="no-referrer"
        allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'"
        style={{width, height, transform: "scale(" + scale + ")", left: Math.max(0, (availableWidth - width * scale) / 2)}} />
    </div>
  </section>;
}

export default function PreviewPanel({job}: {job: Job | null}) {
  const {preview, error, retry} = usePreview(job?.id, job?.status === "completed");
  const [layout, setLayout] = useState<Layout>("compare");
  const [device, setDevice] = useState<Device>("desktop");
  const [path, setPath] = useState("/");
  const [draftPath, setDraftPath] = useState("/");
  const [pathError, setPathError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => { setPath("/"); setDraftPath("/"); setPathError(""); }, [job?.id]);
  const before = preview.before_url ? previewPageUrl(preview.before_url, path) : null;
  const after = preview.after_url ? previewPageUrl(preview.after_url, path) : null;
  function navigate(event: FormEvent) {
    event.preventDefault();
    const nextPath = draftPath.trim();
    if (!previewPageUrl(preview.before_url || "https://preview.invalid/", nextPath)) {
      setPathError("Use a page path such as / or /login.");
      return;
    }
    setPathError("");
    setPath(nextPath);
  }
  const ready = preview.status === "ready" && before && after;
  const building = job?.status === "completed" && ["idle", "building"].includes(preview.status) && !error;
  return <section className="card preview-panel" aria-labelledby="preview-title">
    <div className="section-heading"><div><span className="eyebrow">04 / SEE IT IN ACTION</span><h2 id="preview-title">See the change. Before you ship.</h2></div><span className={"status-pill " + (ready ? "status-completed" : building ? "status-generating" : "status-idle")}><span className="status-dot"/>{ready ? "Preview ready" : building ? "Preparing previews" : "Visual preview"}</span></div>
    <div className="preview-description"><p>Compare the current interface with your updated version. Both stay separate from your live repository.</p><span><Code2 size={13}/> Code diff available above</span></div>
    <div className="preview-toolbar">
      <div className="segmented-control" role="group" aria-label="Preview layout">
        <button aria-pressed={layout === "compare"} onClick={() => setLayout("compare")}><Columns2 size={13}/> Compare</button>
        <button aria-pressed={layout === "before"} onClick={() => setLayout("before")}>Current</button>
        <button aria-pressed={layout === "after"} onClick={() => setLayout("after")}>Updated</button>
      </div>
      <div className="preview-tools"><div className="segmented-control" role="group" aria-label="Preview device">
        <button aria-label="Desktop preview" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}><Monitor size={15}/></button>
        <button aria-label="Mobile preview" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}><Smartphone size={15}/></button>
      </div><button className="icon-button" aria-label="Reload previews" disabled={!ready} onClick={() => {setRefreshKey(value => value + 1); retry();}}><RefreshCw size={14}/></button></div>
    </div>
    {ready ? <form className="preview-route" onSubmit={navigate}><label htmlFor="preview-path">Page path</label><div className="input-wrap"><input id="preview-path" value={draftPath} onChange={event => setDraftPath(event.target.value)} spellCheck={false} placeholder="/login" aria-invalid={Boolean(pathError)} aria-describedby={pathError ? "preview-path-error" : "preview-path-hint"} /><button type="submit" aria-label="Open page in both previews"><ArrowRight size={15}/></button></div><span id="preview-path-hint">Open the same page in both versions.</span>{pathError ? <p className="field-error" id="preview-path-error">{pathError}</p> : null}</form> : null}
    {error ? <div className="preview-error"><ErrorAlert error={error}/><button className="text-button" onClick={retry}><RefreshCw size={13}/>Try preview again</button></div> : ready ? (
      <div className={"preview-frames " + (layout === "compare" ? "preview-compare" : "preview-single")}>
        {layout !== "after" ? <PreviewFrame title="Current" url={before} device={device} updated={false} refreshKey={refreshKey}/> : null}
        {layout !== "before" ? <PreviewFrame title="Updated" url={after} device={device} updated refreshKey={refreshKey}/> : null}
      </div>
    ) : <div className="preview-empty">
      <div className="preview-empty-icon"><Eye size={24}/></div>
      <h3>{building ? "Preparing both versions of your app" : preview.status === "unsupported" ? "This project needs a different preview setup" : preview.status === "failed" ? "The preview could not be built" : "A side-by-side look at what changes"}</h3>
      <p>{building ? "Building the original and updated interfaces. Your code diff is already available to review." : preview.message || (job && job.status !== "completed" ? "The current and updated interfaces will appear here when your code change is ready." : "Sign in, choose a repository, and generate a change. We will prepare a preview of each version for you.")}</p>
      {["failed", "unsupported"].includes(preview.status) ? <button className="text-button" onClick={retry}><RefreshCw size={13}/>Try preview again</button> : <div className="preview-empty-pair" aria-hidden="true"><span>Current <span className="mini-browser"><i/><i/><i/></span></span><ArrowRight size={18}/><span>Updated <span className="mini-browser mini-browser-new"><i/><i/><i/></span></span></div>}
    </div>}
    <div className="preview-footnote"><span className="status-dot"/><span>Isolated UI previews. App backends, sign-in, and external services are not connected.</span></div>
  </section>;
}
