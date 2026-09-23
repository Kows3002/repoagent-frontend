import { CornerDownLeft, FileCode2 } from "lucide-react";
export const EXAMPLE_TASK =
  'Modify ONLY src/pages/Login.jsx.\n\nReplace the Helmet title "Sign in | Visitor Pass"\nwith\n"Login | Visitor Pass".\n\nDo not change any other code, formatting, imports, JSX, or logic.';
export default function TaskInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="field task-field">
      <div className="field-label-row">
        <label htmlFor="task">Describe the code change</label>
        <button
          className="text-button"
          type="button"
          disabled={disabled}
          onClick={() => onChange(EXAMPLE_TASK)}
        >
          Use example <CornerDownLeft size={12} />
        </button>
      </div>
      <div className="task-editor">
        <div className="editor-bar">
          <span>
            <FileCode2 size={13} /> task.txt
          </span>
          <span>PLAIN TEXT</span>
        </div>
        <textarea
          id="task"
          name="task"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={EXAMPLE_TASK}
          required
          disabled={disabled}
          aria-describedby="task-hint"
          spellCheck={false}
        />
        <div className="editor-footer">
          <span>Be specific. Keep it focused.</span>
          <span>{value.length.toLocaleString()} characters</span>
        </div>
      </div>
      <p id="task-hint" className="field-hint">
        Mention the exact file path and exact text to replace for best results.
      </p>
    </div>
  );
}
