const fs = require("node:fs");
const path = require("node:path");

const targetPath = path.join(
  process.cwd(),
  "frontend",
  "src",
  "pages",
  "ConfigurationPage.tsx"
);

const raw = fs.readFileSync(targetPath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
let source = raw.replace(/\r\n/g, "\n");

function replaceExactlyOnce(label, oldText, newText) {
  const first = source.indexOf(oldText);
  if (first < 0) {
    throw new Error(`Missing expected source for: ${label}`);
  }

  const second = source.indexOf(oldText, first + oldText.length);
  if (second >= 0) {
    throw new Error(`Expected unique source for: ${label}`);
  }

  source =
    source.slice(0, first) +
    newText +
    source.slice(first + oldText.length);
}

replaceExactlyOnce(
  "LadderDraftStep contains only editable rows",
  `type LadderDraftStep = {
  clientId: string;
  isImplicitBase: boolean;
  standingLabel: string;
  deductionPercent: string;
};`,
  `type LadderDraftStep = {
  clientId: string;
  standingLabel: string;
  deductionPercent: string;
};`
);

replaceExactlyOnce(
  "openLadderEditor builds only visible editable standings",
  `    /*
     * The only hidden/default row is the system Clear base state.
     * A threshold of 0 alone must not hide another standing such as
     * Formal Warning if historical data happens to share that value.
     */
    const isClearBaseStep =
      (step: StrikeLadderStep) =>
        step.minActiveStrikes === 0 &&
        step.standingLabel
          .trim()
          .toLowerCase() ===
          "clear";

    const orderedSteps =
      [...currentLadder.steps].sort(
        (first, second) => {
          const firstIsClear =
            isClearBaseStep(first);
          const secondIsClear =
            isClearBaseStep(second);

          if (
            firstIsClear !==
            secondIsClear
          ) {
            return firstIsClear
              ? -1
              : 1;
          }

          return (
            first.minActiveStrikes -
            second.minActiveStrikes
          );
        }
      );

    const draftSteps:
      LadderDraftStep[] =
      orderedSteps.map(
        (step) => ({
          clientId:
            nextLadderDraftId(),

          isImplicitBase:
            isClearBaseStep(step),

          standingLabel:
            step.standingLabel,

          deductionPercent:
            isClearBaseStep(step)
              ? "0"
              : String(
                  step.deductionPercent
                ),
        })
      );

    if (
      !draftSteps.some(
        (step) => step.isImplicitBase
      )
    ) {
      draftSteps.unshift({
        clientId:
          nextLadderDraftId(),
        isImplicitBase: true,
        standingLabel: "Clear",
        deductionPercent: "0",
      });
    }

    setLadderDraftSteps(
      draftSteps
    );`,
  `    /*
     * The editor contains only real, editable strike standings.
     * The permanent 0-strike Clear base is intentionally excluded
     * here and is reattached only when the save payload is built.
     *
     * Using the same > 0 boundary as the read-only configuration
     * table guarantees Formal Warning appears as editable strike 1.
     */
    const draftSteps:
      LadderDraftStep[] =
      [...currentLadder.steps]
        .filter(
          (step) =>
            step.minActiveStrikes > 0
        )
        .sort(
          (first, second) =>
            first.minActiveStrikes -
            second.minActiveStrikes
        )
        .map(
          (step) => ({
            clientId:
              nextLadderDraftId(),

            standingLabel:
              step.standingLabel,

            deductionPercent:
              String(
                step.deductionPercent
              ),
          })
        );

    setLadderDraftSteps(
      draftSteps
    );`
);

replaceExactlyOnce(
  "editable rows have no hidden-base mutation guard",
  `    setLadderDraftSteps(
      (current) => {
        const targetIndex =
          current.findIndex(
            (step) =>
              step.clientId ===
              clientId
          );

        /*
         * The base row's deduction is a protected system
         * rule. Even an accidental UI call cannot change it.
         */
        if (
          targetIndex === 0 &&
          field ===
            "deductionPercent"
        ) {
          return current;
        }

        return current.map(
          (step) =>
            step.clientId ===
            clientId
              ? {
                  ...step,
                  [field]:
                    value,
                }
              : step
        );
      }
    );`,
  `    setLadderDraftSteps(
      (current) =>
        current.map(
          (step) =>
            step.clientId ===
            clientId
              ? {
                  ...step,
                  [field]:
                    value,
                }
              : step
        )
    );`
);

replaceExactlyOnce(
  "Add Step counts only editable rows while respecting backend total max",
  `    /*
     * The backend accepts a maximum of 50 steps. Keep the
     * editor aligned with that same rule and give management
     * immediate feedback instead of silently doing nothing.
     */
    if (
      ladderDraftSteps.length >=
      50
    ) {
      const message =
        "The strike ladder cannot contain more than 50 steps.";`,
  `    /*
     * The backend accepts a maximum of 50 total steps.
     * One slot is permanently reserved for the hidden Clear
     * base, leaving up to 49 editable strike standings.
     */
    if (
      ladderDraftSteps.length >=
      49
    ) {
      const message =
        "The strike ladder cannot contain more than 49 editable strike steps.";`
);

replaceExactlyOnce(
  "new editable step numbering starts at strike 1",
  `    /*
     * Active-strike numbers are system controlled.
     * The new row automatically becomes the next sequential
     * strike number because its array index is the threshold.
     */
    const newStepId =
      nextLadderDraftId();

    const newStepNumber =
      ladderDraftSteps.length;`,
  `    /*
     * The draft contains only editable strikes, so visible
     * index 0 corresponds to active strike 1.
     */
    const newStepId =
      nextLadderDraftId();

    const newStepNumber =
      ladderDraftSteps.length + 1;`
);

replaceExactlyOnce(
  "new editable step no longer carries implicit base flag",
  `        {
          clientId:
            newStepId,

          isImplicitBase: false,

          standingLabel:
            "New Standing",`,
  `        {
          clientId:
            newStepId,

          standingLabel:
            "New Standing",`
);

replaceExactlyOnce(
  "all visible ladder rows can be removed",
  `  function removeLadderStep(
    clientId: string
  ) {
    const targetIndex =
      ladderDraftSteps.findIndex(
        (step) =>
          step.clientId ===
          clientId
      );

    /*
     * Index 0 is the permanent base state.
     * Management may edit its label and deduction,
     * but the base row itself can never be removed.
     */
    if (targetIndex === 0) {
      const message =
        "The 0-strike base step cannot be removed.";

      setLadderFormError(
        message
      );

      toast.error(
        message,
        "Base step required"
      );

      return;
    }

    if (targetIndex < 0) {
      return;
    }

    /*
     * No threshold renumbering is stored in the draft.
     * Once a row is removed, the remaining array indexes
     * immediately become 0, 1, 2, 3... in the UI and API.
     */
    setLadderDraftSteps(
      (current) =>
        current.filter(
          (step) =>
            step.clientId !==
            clientId
        )
    );`,
  `  function removeLadderStep(
    clientId: string
  ) {
    const targetExists =
      ladderDraftSteps.some(
        (step) =>
          step.clientId ===
          clientId
      );

    if (!targetExists) {
      return;
    }

    /*
     * Every row in the draft is a real editable standing.
     * Removing one automatically renumbers the remaining
     * visible rows as strikes 1, 2, 3... on save.
     */
    setLadderDraftSteps(
      (current) =>
        current.filter(
          (step) =>
            step.clientId !==
            clientId
        )
    );`
);

replaceExactlyOnce(
  "submit rebuilds hidden Clear base before editable rows",
  `    /*
     * Step 0 is permanent, so a valid editor state
     * must always contain at least that base row.
     */
    if (
      ladderDraftSteps.length ===
      0
    ) {
      showLadderError(
        "The 0-strike base step is required."
      );

      return;
    }

    const parsedSteps:
      StrikeLadderPayloadStep[] =
      [];

    for (
      const [
        index,
        draft,
      ] of
        ladderDraftSteps.entries()
    ) {
      /*
       * 0 active strikes is the permanent default state,
       * so its deduction is always 0%. Management may only
       * change the wording of that base standing.
       */
      const deduction =
        index === 0
          ? 0
          : Number(
              draft.deductionPercent
            );`,
  `    if (!currentLadder) {
      showLadderError(
        "The current strike ladder could not be loaded."
      );

      return;
    }

    /*
     * Clear is a permanent system base and never appears as an
     * editable modal row. Preserve its current label internally
     * and always enforce the protected 0% base deduction.
     */
    const currentBaseStep =
      [...currentLadder.steps]
        .sort(
          (first, second) =>
            first.minActiveStrikes -
            second.minActiveStrikes
        )
        .find(
          (step) =>
            step.minActiveStrikes === 0
        );

    const parsedSteps:
      StrikeLadderPayloadStep[] = [
        {
          standingLabel:
            currentBaseStep
              ?.standingLabel
              .trim() ||
            "Clear",

          deductionPercent: 0,
        },
      ];

    for (
      const draft of
        ladderDraftSteps
    ) {
      const deduction =
        Number(
          draft.deductionPercent
        );`
);

replaceExactlyOnce(
  "modal directly renders all editable rows as strikes index plus one",
  `              <div className="strike-ladder-editor-list">
                {ladderDraftSteps.map(
                  (
                    step,
                    index
                  ) =>
                    step.isImplicitBase
                      ? null
                      : (
                    <div
                      className={[
                        "strike-ladder-editor-row",

                        newlyAddedLadderStepId ===
                        step.clientId
                          ? "newly-added"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={
                        step.clientId
                      }
                      ref={(element) => {
                        if (element) {
                          ladderStepElementRefs.current.set(
                            step.clientId,
                            element
                          );
                        } else {
                          ladderStepElementRefs.current.delete(
                            step.clientId
                          );
                        }
                      }}
                    >
                      <div className="strike-ladder-system-threshold">
                        <span>
                          Active Strikes
                        </span>

                        <strong>
                          {index}
                        </strong>

                        {index === 0 && (
                          <small>
                            Required base
                          </small>
                        )}
                      </div>

                      <label className="form-field strike-ladder-label-field">
                        <span>
                          Standing
                        </span>

                        <input
                          type="text"
                          data-ladder-standing-input="true"
                          maxLength={
                            120
                          }
                          value={
                            step.standingLabel
                          }
                          onChange={(
                            event
                          ) =>
                            updateLadderDraftStep(
                              step.clientId,
                              "standingLabel",
                              event.target
                                .value
                            )
                          }
                          disabled={
                            isSavingLadder
                          }
                        />
                      </label>

                      {index === 0 ? (
                        <div className="strike-ladder-fixed-deduction">
                          <span>
                            Deduction %
                          </span>

                          <strong>
                            0%
                          </strong>

                          <small>
                            Fixed default
                          </small>
                        </div>
                      ) : (
                        <label className="form-field strike-ladder-deduction-field">
                          <span>
                            Deduction %
                          </span>

                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={
                              step.deductionPercent
                            }
                            onChange={(
                              event
                            ) =>
                              updateLadderDraftStep(
                                step.clientId,
                                "deductionPercent",
                                event.target
                                  .value
                              )
                            }
                            disabled={
                              isSavingLadder
                            }
                          />
                        </label>
                      )}

                      {index === 0 ? (
                        <span className="strike-ladder-base-step">
                          Base
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="text-button danger strike-ladder-remove-step"
                          onClick={() =>
                            removeLadderStep(
                              step.clientId
                            )
                          }
                          disabled={
                            isSavingLadder
                          }
                          title="Remove ladder step"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )
                )}
              </div>`,
  `              <div className="strike-ladder-editor-list">
                {ladderDraftSteps.map(
                  (
                    step,
                    index
                  ) => (
                    <div
                      className={[
                        "strike-ladder-editor-row",

                        newlyAddedLadderStepId ===
                        step.clientId
                          ? "newly-added"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={
                        step.clientId
                      }
                      ref={(element) => {
                        if (element) {
                          ladderStepElementRefs.current.set(
                            step.clientId,
                            element
                          );
                        } else {
                          ladderStepElementRefs.current.delete(
                            step.clientId
                          );
                        }
                      }}
                    >
                      <div className="strike-ladder-system-threshold">
                        <span>
                          Active Strikes
                        </span>

                        <strong>
                          {index + 1}
                        </strong>
                      </div>

                      <label className="form-field strike-ladder-label-field">
                        <span>
                          Standing
                        </span>

                        <input
                          type="text"
                          data-ladder-standing-input="true"
                          maxLength={
                            120
                          }
                          value={
                            step.standingLabel
                          }
                          onChange={(
                            event
                          ) =>
                            updateLadderDraftStep(
                              step.clientId,
                              "standingLabel",
                              event.target
                                .value
                            )
                          }
                          disabled={
                            isSavingLadder
                          }
                        />
                      </label>

                      <label className="form-field strike-ladder-deduction-field">
                        <span>
                          Deduction %
                        </span>

                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={
                            step.deductionPercent
                          }
                          onChange={(
                            event
                          ) =>
                            updateLadderDraftStep(
                              step.clientId,
                              "deductionPercent",
                              event.target
                                .value
                            )
                          }
                          disabled={
                            isSavingLadder
                          }
                        />
                      </label>

                      <button
                        type="button"
                        className="text-button danger strike-ladder-remove-step"
                        onClick={() =>
                          removeLadderStep(
                            step.clientId
                          )
                        }
                        disabled={
                          isSavingLadder
                        }
                        title="Remove ladder step"
                      >
                        Remove
                      </button>
                    </div>
                  )
                )}
              </div>`
);

if (source.includes("isImplicitBase")) {
  throw new Error("Verification failed: implicit base flag still exists.");
}

if (!source.includes("step.minActiveStrikes > 0")) {
  throw new Error("Verification failed: editor visible-step filter missing.");
}

if (!source.includes("{index + 1}")) {
  throw new Error("Verification failed: modal strike numbering is not 1-based.");
}

if (!source.includes("currentBaseStep")) {
  throw new Error("Verification failed: hidden Clear base is not preserved in payload.");
}

fs.writeFileSync(
  targetPath,
  source.replace(/\n/g, eol),
  "utf8"
);

console.log("✓ Strike Ladder editor draft now contains only editable strike standings.");
console.log("✓ Formal Warning is rendered as editable strike 1.");
console.log("✓ Clear remains hidden and is preserved only in the save payload.");
console.log("✓ Visible rows can be edited or removed; numbering remains sequential.");
console.log("F.5.6 ladder editor refactor applied successfully.");
