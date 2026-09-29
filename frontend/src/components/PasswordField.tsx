import {
  useId,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";

type PasswordFieldProps = {
  label: string;
  value: string;
  onChange: (
    event:
      ChangeEvent<HTMLInputElement>
  ) => void;
  autoComplete:
    "current-password" |
    "new-password";
  placeholder?: string;
  minLength?: number;
  helper?: ReactNode;
  below?: ReactNode;
  autoFocus?: boolean;
};

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
  helper,
  below,
  autoFocus = false,
}: PasswordFieldProps) {
  const id =
    useId();

  const [
    visible,
    setVisible,
  ] =
    useState(false);

  return (
    <div className="auth-field">
      <label
        className="auth-label"
        htmlFor={
          id
        }
      >
        {label}
      </label>

      <div className="auth-password-control">
        <input
          id={
            id
          }
          className="auth-input auth-password-input"
          type={
            visible
              ? "text"
              : "password"
          }
          autoComplete={
            autoComplete
          }
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={
            false
          }
          minLength={
            minLength
          }
          value={
            value
          }
          onChange={
            onChange
          }
          placeholder={
            placeholder
          }
          required
          autoFocus={
            autoFocus
          }
        />

        <button
          type="button"
          className="auth-password-toggle"
          onClick={() =>
            setVisible(
              (
                current
              ) =>
                !current
            )
          }
          aria-label={
            visible
              ? "Hide password"
              : "Show password"
          }
          aria-pressed={
            visible
          }
          title={
            visible
              ? "Hide password"
              : "Show password"
          }
        >
          {visible ? (
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.8 10.8 0 0 1 12 4c5.5 0 9 5 9 8a10.9 10.9 0 0 1-2.2 3.7M6.6 6.6C4.4 8 3 10.2 3 12c0 3 3.5 8 9 8a10.6 10.6 0 0 0 4-.8"
              />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                d="M3 12c0-3 3.5-8 9-8s9 5 9 8-3.5 8-9 8-9-5-9-8Z"
              />

              <circle
                cx="12"
                cy="12"
                r="2.5"
              />
            </svg>
          )}
        </button>
      </div>

      {helper && (
        <div className="auth-field-help">
          {helper}
        </div>
      )}

      {below && (
        <div className="auth-field-below">
          {below}
        </div>
      )}
    </div>
  );
}

export default PasswordField;
