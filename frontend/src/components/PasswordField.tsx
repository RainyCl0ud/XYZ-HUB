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
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M2.8 12s3.2-6.5 9.2-6.5S21.2 12 21.2 12 18 18.5 12 18.5 2.8 12 2.8 12Z"
            />

            <circle
              cx="12"
              cy="12"
              r="2.6"
            />

            {visible && (
              <path
                d="M4 4 20 20"
              />
            )}
          </svg>
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
