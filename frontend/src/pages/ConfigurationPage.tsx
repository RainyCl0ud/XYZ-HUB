import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  DragEvent,
  FormEvent,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import { apiRequest } from "../lib/api";

import {
  formatCentralDateTime,
} from "../lib/time";

import {
  useToast,
} from "../components/ToastProvider";

type OptionKind =
  | "severity"
  | "weight";

type BaseOption = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type SeverityOption =
  BaseOption;

type WeightOption =
  BaseOption & {
    value: number | null;
  };

type StrikeLadderStep = {
  id: string;
  ladderVersionId: string;
  minActiveStrikes: number;
  standingLabel: string;
  deductionPercent: number;
};

type StrikeLadderVersion = {
  id: string;
  versionNumber: number;
  durationDays: number;
  isCurrent: boolean;
  createdAt: string;
  steps: StrikeLadderStep[];
};

type StrikeLadderPayloadStep = {
  standingLabel: string;
  deductionPercent: number;
};

type StrikeLadderPayload = {
  durationDays: number;
  steps: StrikeLadderPayloadStep[];
};

type LadderDraftStep = {
  clientId: string;
  standingLabel: string;
  deductionPercent: string;
};

type OptionListResponse<T> = {
  data: T[];
};

type DataResponse<T> = {
  data: T;
};

type MutationResponse<T> = {
  message: string;
  data: T;
};

type SeverityPayload = {
  name: string;
  description: string | null;
};

type WeightPayload = {
  name: string;
  value: number | null;
  description: string | null;
};

type PendingConfirmation =
  | {
      type: "save";
      kind: "severity";
      mode: "create" | "edit";
      optionId: string | null;
      payload: SeverityPayload;
    }
  | {
      type: "save";
      kind: "weight";
      mode: "create" | "edit";
      optionId: string | null;
      payload: WeightPayload;
    }
  | {
      type: "status";
      kind: OptionKind;
      action:
        | "archive"
        | "reactivate";
      option:
        | SeverityOption
        | WeightOption;
    }
  | {
      type: "order";
      kind: OptionKind;
    }
  | {
      type: "ladder";
      payload: StrikeLadderPayload;
    };

type ConfigurationMode =
  | "rules"
  | "strikes";

function ConfigurationPage({
  mode,
}: {
  mode:
    ConfigurationMode;
}) {
  const toast = useToast();

  const navigate =
    useNavigate();

  /*
   * =========================================================
   * DATA
   * =========================================================
   */

  const [
    severityOptions,
    setSeverityOptions,
  ] = useState<
    SeverityOption[]
  >([]);

  const [
    weightOptions,
    setWeightOptions,
  ] = useState<
    WeightOption[]
  >([]);

  const [
    currentLadder,
    setCurrentLadder,
  ] = useState<
    StrikeLadderVersion | null
  >(null);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    pageError,
    setPageError,
  ] = useState("");

  /*
   * =========================================================
   * ADD / EDIT SEVERITY + WEIGHT
   * =========================================================
   */

  const [
    modalKind,
    setModalKind,
  ] =
    useState<OptionKind | null>(
      null
    );

  const [
    editingOption,
    setEditingOption,
  ] = useState<
    | SeverityOption
    | WeightOption
    | null
  >(null);

  const [
    name,
    setName,
  ] = useState("");

  const [
    description,
    setDescription,
  ] = useState("");

  const [
    weightValue,
    setWeightValue,
  ] = useState("");

  const [
    formError,
    setFormError,
  ] = useState("");

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);

  const [
    actionId,
    setActionId,
  ] =
    useState<string | null>(
      null
    );

  /*
   * =========================================================
   * SETTINGS / ARCHIVE
   * =========================================================
   */

  const [
    settingsMenuKind,
    setSettingsMenuKind,
  ] =
    useState<OptionKind | null>(
      null
    );

  const [
    archiveModalKind,
    setArchiveModalKind,
  ] =
    useState<OptionKind | null>(
      null
    );

  useEffect(() => {
    if (!settingsMenuKind) {
      return;
    }

    function handleOutsideClick(
      event: MouseEvent
    ) {
      const target =
        event.target;

      if (
        target instanceof Element &&
        target.closest(
          "[data-config-settings-menu]"
        )
      ) {
        return;
      }

      setSettingsMenuKind(
        null
      );
    }

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
    };
  }, [settingsMenuKind]);

  /*
   * =========================================================
   * REORDER
   * =========================================================
   */

  const [
    reorderKind,
    setReorderKind,
  ] =
    useState<OptionKind | null>(
      null
    );

  const [
    isSavingOrder,
    setIsSavingOrder,
  ] = useState(false);

  const [
    draggedId,
    setDraggedId,
  ] =
    useState<string | null>(
      null
    );

  const [
    dragOverId,
    setDragOverId,
  ] =
    useState<string | null>(
      null
    );

  const [
    lastMovedId,
    setLastMovedId,
  ] =
    useState<string | null>(
      null
    );

  const placedTimerRef =
    useRef<number | null>(
      null
    );

  const [
    severityBackup,
    setSeverityBackup,
  ] = useState<
    SeverityOption[]
  >([]);

  const [
    weightBackup,
    setWeightBackup,
  ] = useState<
    WeightOption[]
  >([]);

  /*
   * =========================================================
   * STRIKE LADDER EDITOR + HISTORY
   * =========================================================
   */

  const [
    showLadderEditor,
    setShowLadderEditor,
  ] = useState(false);

  const [
    ladderDuration,
    setLadderDuration,
  ] = useState("");

  const [
    ladderDraftSteps,
    setLadderDraftSteps,
  ] = useState<
    LadderDraftStep[]
  >([]);

  const [
    ladderFormError,
    setLadderFormError,
  ] = useState("");

  const [
    isSavingLadder,
    setIsSavingLadder,
  ] = useState(false);

  const [
    showLadderHistory,
    setShowLadderHistory,
  ] = useState(false);

  const [
    ladderHistory,
    setLadderHistory,
  ] = useState<
    StrikeLadderVersion[]
  >([]);

  const [
    ladderHistoryLoading,
    setLadderHistoryLoading,
  ] = useState(false);

  const ladderDraftIdRef =
    useRef(0);

  const [
    newlyAddedLadderStepId,
    setNewlyAddedLadderStepId,
  ] = useState<string | null>(
    null
  );

  const ladderStepElementRefs =
    useRef<
      Map<string, HTMLDivElement>
    >(new Map());

  const ladderHasChanges =
    useMemo(
      () => {
        if (
          !showLadderEditor ||
          !currentLadder
        ) {
          return false;
        }

        if (
          Number(
            ladderDuration
          ) !==
          currentLadder.durationDays
        ) {
          return true;
        }

        const currentEditableSteps =
          [...currentLadder.steps]
            .filter(
              (step) =>
                !(
                  step.minActiveStrikes ===
                    0 &&
                  step.standingLabel
                    .trim()
                    .toLowerCase() ===
                    "clear"
                )
            )
            .sort(
              (first, second) =>
                first.minActiveStrikes -
                second.minActiveStrikes
            );

        if (
          currentEditableSteps.length !==
          ladderDraftSteps.length
        ) {
          return true;
        }

        return currentEditableSteps.some(
          (step, index) => {
            const draft =
              ladderDraftSteps[index];

            return (
              step.minActiveStrikes !==
                index + 1 ||
              step.standingLabel.trim() !==
                draft.standingLabel.trim() ||
              step.deductionPercent !==
                Number(
                  draft.deductionPercent
                )
            );
          }
        );
      },
      [
        currentLadder,
        ladderDraftSteps,
        ladderDuration,
        showLadderEditor,
      ]
    );

  /*
   * =========================================================
   * CONFIRMATION
   * =========================================================
   */

  const [
    pendingConfirmation,
    setPendingConfirmation,
  ] =
    useState<PendingConfirmation | null>(
      null
    );

  useEffect(() => {
    /*
     * Rule Settings and Strike Settings intentionally share
     * this implementation component, but their transient UI
     * must never leak across module ownership boundaries.
     */
    setPendingConfirmation(
      null
    );

    setSettingsMenuKind(
      null
    );

    setArchiveModalKind(
      null
    );

    setModalKind(
      null
    );

    setEditingOption(
      null
    );

    setShowLadderEditor(
      false
    );

    setShowLadderHistory(
      false
    );

    setFormError(
      ""
    );

    setLadderFormError(
      ""
    );
  }, [mode]);

  /*
   * =========================================================
   * LOAD CONFIGURATION
   * =========================================================
   */

  const loadConfiguration =
    useCallback(async () => {
      try {
        setIsLoading(true);
        setPageError("");

        if (
          mode ===
            "rules"
        ) {
          const [
            severityResponse,
            weightResponse,
          ] = await Promise.all([
            apiRequest<
              OptionListResponse<
                SeverityOption
              >
            >(
              "/api/severity-options"
            ),

            apiRequest<
              OptionListResponse<
                WeightOption
              >
            >(
              "/api/weight-options"
            ),
          ]);

          setSeverityOptions(
            severityResponse.data
          );

          setWeightOptions(
            weightResponse.data
          );

          setCurrentLadder(
            null
          );
        } else {
          const ladderResponse =
            await apiRequest<
              DataResponse<
                StrikeLadderVersion
              >
            >(
              "/api/strike-ladder"
            );

          setCurrentLadder(
            ladderResponse.data
          );

          setSeverityOptions(
            []
          );

          setWeightOptions(
            []
          );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : mode ===
                "rules"
              ? "Failed to load rule settings"
              : "Failed to load Strike settings";

        setPageError(
          message
        );

        toast.error(
          message,
          mode ===
            "rules"
            ? "Unable to load rule settings"
            : "Unable to load Strike settings"
        );
      } finally {
        setIsLoading(false);
      }
    }, [
      mode,
      toast,
    ]);

  useEffect(() => {
    void loadConfiguration();
  }, [loadConfiguration]);

  useEffect(() => {
    return () => {
      if (
        placedTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          placedTimerRef.current
        );
      }
    };
  }, []);

  useEffect(() => {
    if (
      !showLadderEditor ||
      !newlyAddedLadderStepId
    ) {
      return;
    }

    const stepId =
      newlyAddedLadderStepId;

    /*
     * Wait for React to render the newly added row, then
     * bring it into view and focus its Standing field.
     */
    const scrollTimer =
      window.setTimeout(
        () => {
          const row =
            ladderStepElementRefs.current.get(
              stepId
            );

          if (!row) {
            return;
          }

          row.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });

          const standingInput =
            row.querySelector<HTMLInputElement>(
              '[data-ladder-standing-input="true"]'
            );

          window.setTimeout(
            () => {
              standingInput?.focus({
                preventScroll: true,
              });

              standingInput?.select();
            },
            280
          );
        },
        60
      );

    /*
     * Keep the visual highlight long enough to be obvious,
     * then return the row to its normal appearance.
     */
    const highlightTimer =
      window.setTimeout(
        () => {
          setNewlyAddedLadderStepId(
            (current) =>
              current === stepId
                ? null
                : current
          );
        },
        2200
      );

    return () => {
      window.clearTimeout(
        scrollTimer
      );

      window.clearTimeout(
        highlightTimer
      );
    };
  }, [
    newlyAddedLadderStepId,
    showLadderEditor,
  ]);

  /*
   * =========================================================
   * ACTIVE / ARCHIVED COLLECTIONS
   * =========================================================
   */

  const activeSeverityOptions =
    severityOptions.filter(
      (option) =>
        option.isActive
    );

  const archivedSeverityOptions =
    severityOptions.filter(
      (option) =>
        !option.isActive
    );

  const activeWeightOptions =
    weightOptions.filter(
      (option) =>
        option.isActive
    );

  const archivedWeightOptions =
    weightOptions.filter(
      (option) =>
        !option.isActive
    );

  /*
   * =========================================================
   * ARCHIVE MODAL
   * =========================================================
   */

  function openArchiveModal(
    kind: OptionKind
  ) {
    setSettingsMenuKind(null);
    setArchiveModalKind(kind);
  }

  function closeArchiveModal() {
    if (
      actionId !== null
    ) {
      return;
    }

    setPendingConfirmation(
      null
    );

    setArchiveModalKind(
      null
    );
  }

  /*
   * =========================================================
   * SEVERITY / WEIGHT FORM HELPERS
   * =========================================================
   */

  function resetForm() {
    setModalKind(null);
    setEditingOption(null);
    setName("");
    setDescription("");
    setWeightValue("");
    setFormError("");
  }

  function openAddForm(
    kind: OptionKind
  ) {
    if (
      reorderKind ||
      isSavingOrder
    ) {
      return;
    }

    setSettingsMenuKind(
      null
    );

    setPageError("");
    setModalKind(kind);
    setEditingOption(null);
    setName("");
    setDescription("");
    setWeightValue("");
    setFormError("");
  }

  function openEditForm(
    kind: OptionKind,
    option:
      | SeverityOption
      | WeightOption
  ) {
    if (
      reorderKind ||
      isSavingOrder
    ) {
      return;
    }

    setSettingsMenuKind(
      null
    );

    setPageError("");
    setModalKind(kind);
    setEditingOption(
      option
    );

    setName(
      option.name
    );

    setDescription(
      option.description ?? ""
    );

    if (
      kind === "weight" &&
      "value" in option
    ) {
      setWeightValue(
        option.value === null
          ? ""
          : String(
              option.value
            )
      );
    } else {
      setWeightValue("");
    }

    setFormError("");
  }

  function closeModal() {
    if (isSaving) {
      return;
    }

    setPendingConfirmation(
      null
    );

    resetForm();
  }

  function showFormError(
    message: string
  ) {
    setFormError(
      message
    );

    toast.error(
      message,
      "Check configuration details"
    );
  }

  /*
   * =========================================================
   * SEVERITY / WEIGHT FORM VALIDATION
   * =========================================================
   */

  function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!modalKind) {
      return;
    }

    const trimmedName =
      name.trim();

    const trimmedDescription =
      description.trim();

    if (!trimmedName) {
      showFormError(
        "Name is required."
      );

      return;
    }

    if (
      modalKind === "severity"
    ) {
      const payload:
        SeverityPayload = {
        name:
          trimmedName,

        description:
          trimmedDescription ||
          null,
      };

      if (
        editingOption &&
        !("value" in
          editingOption) &&
        editingOption.name.trim() ===
          payload.name &&
        (editingOption.description ??
          "") ===
          (payload.description ?? "")
      ) {
        setFormError("");

        toast.info(
          "No severity changes were detected.",
          "No changes"
        );

        return;
      }

      setFormError("");

      setPendingConfirmation({
        type: "save",
        kind: "severity",

        mode:
          editingOption
            ? "edit"
            : "create",

        optionId:
          editingOption?.id ??
          null,

        payload,
      });

      return;
    }

    let parsedWeightValue:
      | number
      | null = null;

    if (
      weightValue.trim() !==
      ""
    ) {
      parsedWeightValue =
        Number(weightValue);

      if (
        !Number.isInteger(
          parsedWeightValue
        ) ||
        parsedWeightValue < 0
      ) {
        showFormError(
          "Weight value must be a whole number of 0 or greater."
        );

        return;
      }
    }

    const payload:
      WeightPayload = {
      name:
        trimmedName,

      value:
        parsedWeightValue,

      description:
        trimmedDescription ||
        null,
    };

    if (
      editingOption &&
      "value" in
        editingOption &&
      editingOption.name.trim() ===
        payload.name &&
      editingOption.value ===
        payload.value &&
      (editingOption.description ??
        "") ===
        (payload.description ?? "")
    ) {
      setFormError("");

      toast.info(
        "No weight changes were detected.",
        "No changes"
      );

      return;
    }

    setFormError("");

    setPendingConfirmation({
      type: "save",
      kind: "weight",

      mode:
        editingOption
          ? "edit"
          : "create",

      optionId:
        editingOption?.id ??
        null,

      payload,
    });
  }

  /*
   * =========================================================
   * SAVE SEVERITY / WEIGHT
   * =========================================================
   */

  async function saveOption(
    confirmation: Extract<
      PendingConfirmation,
      {
        type: "save";
      }
    >
  ) {
    const endpoint =
      confirmation.kind ===
      "severity"
        ? "/api/severity-options"
        : "/api/weight-options";

    try {
      setIsSaving(true);
      setFormError("");
      setPageError("");

      if (
        confirmation.kind ===
        "severity"
      ) {
        let response:
          MutationResponse<
            SeverityOption
          >;

        if (
          confirmation.mode ===
            "edit" &&
          confirmation.optionId
        ) {
          response =
            await apiRequest<
              MutationResponse<
                SeverityOption
              >
            >(
              `${endpoint}/${confirmation.optionId}`,
              {
                method:
                  "PATCH",

                body:
                  JSON.stringify(
                    confirmation.payload
                  ),
              }
            );
        } else {
          response =
            await apiRequest<
              MutationResponse<
                SeverityOption
              >
            >(
              endpoint,
              {
                method:
                  "POST",

                body:
                  JSON.stringify(
                    confirmation.payload
                  ),
              }
            );
        }

        toast.success(
          response.message,
          confirmation.mode ===
          "edit"
            ? "Severity updated"
            : "Severity added"
        );
      } else {
        let response:
          MutationResponse<
            WeightOption
          >;

        if (
          confirmation.mode ===
            "edit" &&
          confirmation.optionId
        ) {
          response =
            await apiRequest<
              MutationResponse<
                WeightOption
              >
            >(
              `${endpoint}/${confirmation.optionId}`,
              {
                method:
                  "PATCH",

                body:
                  JSON.stringify(
                    confirmation.payload
                  ),
              }
            );
        } else {
          response =
            await apiRequest<
              MutationResponse<
                WeightOption
              >
            >(
              endpoint,
              {
                method:
                  "POST",

                body:
                  JSON.stringify(
                    confirmation.payload
                  ),
              }
            );
        }

        toast.success(
          response.message,
          confirmation.mode ===
          "edit"
            ? "Weight updated"
            : "Weight added"
        );
      }

      setPendingConfirmation(
        null
      );

      resetForm();

      await loadConfiguration();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to save option";

      setPendingConfirmation(
        null
      );

      setFormError(
        message
      );

      toast.error(
        message,
        "Configuration not saved"
      );
    } finally {
      setIsSaving(false);
    }
  }

  /*
   * =========================================================
   * ARCHIVE / REACTIVATE
   * =========================================================
   */

  function requestStatusChange(
    kind: OptionKind,
    option:
      | SeverityOption
      | WeightOption
  ) {
    if (reorderKind) {
      return;
    }

    setSettingsMenuKind(
      null
    );

    setPendingConfirmation({
      type: "status",
      kind,

      action:
        option.isActive
          ? "archive"
          : "reactivate",

      option,
    });
  }

  async function changeStatus(
    confirmation: Extract<
      PendingConfirmation,
      {
        type: "status";
      }
    >
  ) {
    const endpoint =
      confirmation.kind ===
      "severity"
        ? "/api/severity-options"
        : "/api/weight-options";

    try {
      setActionId(
        confirmation.option.id
      );

      setPageError("");

      const response =
        await apiRequest<
          MutationResponse<
            | SeverityOption
            | WeightOption
          >
        >(
          `${endpoint}/${confirmation.option.id}/${confirmation.action}`,
          {
            method: "PATCH",
          }
        );

      setPendingConfirmation(
        null
      );

      const label =
        confirmation.kind ===
        "severity"
          ? "Severity"
          : "Weight";

      toast.success(
        response.message,
        confirmation.action ===
        "archive"
          ? `${label} archived`
          : `${label} reactivated`
      );

      await loadConfiguration();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update option";

      setPendingConfirmation(
        null
      );

      setPageError(
        message
      );

      toast.error(
        message,
        "Configuration not updated"
      );
    } finally {
      setActionId(null);
    }
  }

  /*
   * =========================================================
   * SETTINGS MENU
   * =========================================================
   */

  function toggleSettingsMenu(
    kind: OptionKind
  ) {
    if (
      reorderKind ||
      isSavingOrder ||
      modalKind
    ) {
      return;
    }

    setSettingsMenuKind(
      (current) =>
        current === kind
          ? null
          : kind
    );
  }

  /*
   * =========================================================
   * REORDER MODE
   * =========================================================
   */

  function beginReorder(
    kind: OptionKind
  ) {
    if (
      reorderKind ||
      isSavingOrder ||
      modalKind
    ) {
      return;
    }

    setSettingsMenuKind(
      null
    );

    setPageError("");

    if (
      kind === "severity"
    ) {
      setSeverityBackup(
        severityOptions.map(
          (option) => ({
            ...option,
          })
        )
      );
    } else {
      setWeightBackup(
        weightOptions.map(
          (option) => ({
            ...option,
          })
        )
      );
    }

    setDraggedId(null);
    setDragOverId(null);
    setLastMovedId(null);

    setReorderKind(kind);
  }

  function cancelReorder() {
    if (isSavingOrder) {
      return;
    }

    if (
      reorderKind ===
      "severity"
    ) {
      setSeverityOptions(
        severityBackup.map(
          (option) => ({
            ...option,
          })
        )
      );
    }

    if (
      reorderKind ===
      "weight"
    ) {
      setWeightOptions(
        weightBackup.map(
          (option) => ({
            ...option,
          })
        )
      );
    }

    setReorderKind(null);
    setSeverityBackup([]);
    setWeightBackup([]);
    setDraggedId(null);
    setDragOverId(null);
    setLastMovedId(null);
    setPendingConfirmation(null);
  }

  function moveOption(
    kind: OptionKind,
    sourceId: string,
    targetId: string
  ) {
    const source =
      kind === "severity"
        ? severityOptions
        : weightOptions;

    const sourceIndex =
      source.findIndex(
        (option) =>
          option.id === sourceId
      );

    const targetIndex =
      source.findIndex(
        (option) =>
          option.id === targetId
      );

    if (
      sourceIndex < 0 ||
      targetIndex < 0 ||
      sourceIndex === targetIndex
    ) {
      return;
    }

    const next = [
      ...source,
    ];

    const [
      moved,
    ] = next.splice(
      sourceIndex,
      1
    );

    next.splice(
      targetIndex,
      0,
      moved
    );

    const normalized =
      next.map(
        (option, index) => ({
          ...option,
          sortOrder:
            index + 1,
        })
      );

    if (
      kind === "severity"
    ) {
      setSeverityOptions(
        normalized as SeverityOption[]
      );
    } else {
      setWeightOptions(
        normalized as WeightOption[]
      );
    }
  }

  function flashPlacedItem(
    id: string
  ) {
    setLastMovedId(id);

    if (
      placedTimerRef.current !==
      null
    ) {
      window.clearTimeout(
        placedTimerRef.current
      );
    }

    placedTimerRef.current =
      window.setTimeout(
        () => {
          setLastMovedId(null);
          placedTimerRef.current =
            null;
        },
        500
      );
  }

  function handleDragStart(
    event:
      DragEvent<HTMLDivElement>,
    kind: OptionKind,
    optionId: string
  ) {
    if (
      reorderKind !== kind ||
      isSavingOrder
    ) {
      event.preventDefault();

      return;
    }

    setDraggedId(
      optionId
    );

    setDragOverId(
      optionId
    );

    event.dataTransfer.effectAllowed =
      "move";

    event.dataTransfer.setData(
      "text/plain",
      optionId
    );
  }

  function handleDragOver(
    event:
      DragEvent<HTMLDivElement>,
    kind: OptionKind,
    optionId: string
  ) {
    if (
      reorderKind !== kind ||
      isSavingOrder
    ) {
      return;
    }

    event.preventDefault();

    event.dataTransfer.dropEffect =
      "move";

    if (
      dragOverId !==
      optionId
    ) {
      setDragOverId(
        optionId
      );
    }
  }

  function handleDrop(
    event:
      DragEvent<HTMLDivElement>,
    kind: OptionKind,
    targetId: string
  ) {
    if (
      reorderKind !== kind ||
      isSavingOrder
    ) {
      return;
    }

    event.preventDefault();

    const sourceId =
      draggedId ||
      event.dataTransfer.getData(
        "text/plain"
      );

    if (!sourceId) {
      return;
    }

    const didMove =
      sourceId !== targetId;

    moveOption(
      kind,
      sourceId,
      targetId
    );

    setDraggedId(null);
    setDragOverId(null);

    if (didMove) {
      flashPlacedItem(
        sourceId
      );
    }
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDragOverId(null);
  }

  function requestSaveOrder(
    kind: OptionKind
  ) {
    if (
      reorderKind !== kind ||
      isSavingOrder
    ) {
      return;
    }

    setPendingConfirmation({
      type: "order",
      kind,
    });
  }

  async function saveOrder(
    kind: OptionKind
  ) {
    if (
      reorderKind !== kind ||
      isSavingOrder
    ) {
      return;
    }

    const endpoint =
      kind === "severity"
        ? "/api/severity-options/reorder"
        : "/api/weight-options/reorder";

    const orderedIds =
      kind === "severity"
        ? severityOptions.map(
            (option) =>
              option.id
          )
        : weightOptions.map(
            (option) =>
              option.id
          );

    try {
      setIsSavingOrder(true);
      setPageError("");

      if (
        kind === "severity"
      ) {
        const response =
          await apiRequest<
            OptionListResponse<
              SeverityOption
            >
          >(
            endpoint,
            {
              method:
                "PATCH",

              body:
                JSON.stringify({
                  orderedIds,
                }),
            }
          );

        setSeverityOptions(
          response.data
        );
      } else {
        const response =
          await apiRequest<
            OptionListResponse<
              WeightOption
            >
          >(
            endpoint,
            {
              method:
                "PATCH",

              body:
                JSON.stringify({
                  orderedIds,
                }),
            }
          );

        setWeightOptions(
          response.data
        );
      }

      setPendingConfirmation(
        null
      );

      setReorderKind(null);
      setSeverityBackup([]);
      setWeightBackup([]);
      setDraggedId(null);
      setDragOverId(null);
      setLastMovedId(null);

      toast.success(
        kind === "severity"
          ? "Severity order saved successfully."
          : "Weight order saved successfully.",
        "Order saved"
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to save order";

      setPendingConfirmation(
        null
      );

      setPageError(
        message
      );

      toast.error(
        message,
        "Order not saved"
      );
    } finally {
      setIsSavingOrder(
        false
      );
    }
  }

  /*
   * =========================================================
   * STRIKE LADDER HELPERS
   * =========================================================
   */

  function nextLadderDraftId() {
    ladderDraftIdRef.current +=
      1;

    return `ladder-step-${ladderDraftIdRef.current}`;
  }

  function formatDeduction(
    value: number
  ) {
    return Number.isInteger(value)
      ? String(value)
      : String(
          Number(
            value.toFixed(2)
          )
        );
  }

  function formatThresholdRange(
    steps: StrikeLadderStep[],
    index: number
  ) {
    const current =
      steps[index];

    const next =
      steps[index + 1];

    if (!next) {
      return `${current.minActiveStrikes}+`;
    }

    if (
      next.minActiveStrikes ===
      current.minActiveStrikes +
        1
    ) {
      return String(
        current.minActiveStrikes
      );
    }

    return `${current.minActiveStrikes}–${next.minActiveStrikes - 1}`;
  }

  function sameLadderConfiguration(
    payload:
      StrikeLadderPayload
  ) {
    if (!currentLadder) {
      return false;
    }

    if (
      currentLadder.durationDays !==
      payload.durationDays
    ) {
      return false;
    }

    const currentSteps =
      [...currentLadder.steps]
        .sort(
          (first, second) =>
            first.minActiveStrikes -
            second.minActiveStrikes
        );

    if (
      currentSteps.length !==
      payload.steps.length
    ) {
      return false;
    }

    return currentSteps.every(
      (step, index) => {
        const submitted =
          payload.steps[index];

        /*
         * New ladder versions are always sequential.
         * If an older/current configuration somehow contains
         * a gap, saving through the editor normalizes it.
         */
        return (
          step.minActiveStrikes ===
            index &&
          step.standingLabel.trim() ===
            submitted.standingLabel &&
          step.deductionPercent ===
            submitted.deductionPercent
        );
      }
    );
  }

  function openLadderEditor() {
    if (!currentLadder) {
      return;
    }

    setPageError("");
    setLadderFormError("");
    setNewlyAddedLadderStepId(
      null
    );

    setLadderDuration(
      String(
        currentLadder.durationDays
      )
    );

    /*
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
      orderedSteps
        .filter(
          (step) =>
            !isClearBaseStep(step)
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
    );

    setShowLadderEditor(
      true
    );
  }

  function closeLadderEditor() {
    if (isSavingLadder) {
      return;
    }

    setPendingConfirmation(
      null
    );

    setShowLadderEditor(
      false
    );

    setLadderFormError("");
    setLadderDuration("");
    setLadderDraftSteps([]);
    setNewlyAddedLadderStepId(
      null
    );
    ladderStepElementRefs.current.clear();
  }

  function updateLadderDraftStep(
    clientId: string,
    field:
      | "standingLabel"
      | "deductionPercent",
    value: string
  ) {
    setLadderDraftSteps(
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
    );

    if (ladderFormError) {
      setLadderFormError("");
    }
  }

  function addLadderStep() {
    /*
     * The backend accepts a maximum of 50 total steps.
     * Clear occupies system index 0, leaving up to 49
     * management-configurable standings in the editor.
     */
    if (
      ladderDraftSteps.length >=
      49
    ) {
      const message =
        "The strike ladder cannot contain more than 49 configurable steps.";

      setLadderFormError(
        message
      );

      toast.error(
        message,
        "Step not added"
      );

      return;
    }

    /*
     * Active-strike numbers are system controlled.
     * Visible rows start at strike 1 because Clear is
     * excluded from the editable draft.
     */
    const newStepId =
      nextLadderDraftId();

    const newStepNumber =
      ladderDraftSteps.length + 1;

    setLadderDraftSteps(
      (current) => [
        ...current,

        {
          clientId:
            newStepId,

          standingLabel:
            "New Standing",

          deductionPercent:
            "0",
        },
      ]
    );

    setNewlyAddedLadderStepId(
      newStepId
    );

    setLadderFormError("");

    toast.success(
      `Strike step ${newStepNumber} was added.`,
      "Step added"
    );
  }

  function removeLadderStep(
    clientId: string
  ) {
    const targetIndex =
      ladderDraftSteps.findIndex(
        (step) =>
          step.clientId ===
          clientId
      );


    if (targetIndex < 0) {
      return;
    }

    /*
     * Visible strike numbers are derived from index + 1.
     * Removing a row automatically renumbers the remaining
     * management-configurable standings.
     */
    setLadderDraftSteps(
      (current) =>
        current.filter(
          (step) =>
            step.clientId !==
            clientId
        )
    );

    ladderStepElementRefs.current.delete(
      clientId
    );

    if (
      newlyAddedLadderStepId ===
      clientId
    ) {
      setNewlyAddedLadderStepId(
        null
      );
    }

    setLadderFormError("");
  }

  function showLadderError(
    message: string
  ) {
    setLadderFormError(
      message
    );

    toast.error(
      message,
      "Check strike ladder"
    );
  }

  function handleLadderSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const durationDays =
      Number(
        ladderDuration
      );

    if (
      !Number.isInteger(
        durationDays
      ) ||
      durationDays < 1 ||
      durationDays > 365
    ) {
      showLadderError(
        "Strike duration must be a whole number between 1 and 365 days."
      );

      return;
    }


    const parsedSteps:
      StrikeLadderPayloadStep[] =
      [];

    for (const draft of ladderDraftSteps) {
      const deduction =
        Number(
          draft.deductionPercent
        );

      const label =
        draft.standingLabel.trim();

      if (!label) {
        showLadderError(
          "Every ladder step must have a standing label."
        );

        return;
      }

      if (
        label.length > 120
      ) {
        showLadderError(
          "Standing labels must be 120 characters or fewer."
        );

        return;
      }

      if (
        !Number.isFinite(
          deduction
        ) ||
        deduction < 0 ||
        deduction > 100
      ) {
        showLadderError(
          "Every deduction percentage must be between 0 and 100."
        );

        return;
      }

      parsedSteps.push({
        standingLabel:
          label,

        deductionPercent:
          deduction,
      });
    }

    /*
     * The API derives minActiveStrikes from array position:
     * index 0 → 0 strikes
     * index 1 → 1 strike
     * index 2 → 2 strikes
     * and so on.
     */
    const payload:
      StrikeLadderPayload = {
      durationDays,
      steps: [
        {
          standingLabel:
            "Clear",
          deductionPercent:
            0,
        },
        ...parsedSteps,
      ],
    };

    if (
      sameLadderConfiguration(
        payload
      )
    ) {
      setLadderFormError("");

      toast.info(
        "No strike ladder changes were detected.",
        "No changes"
      );

      return;
    }

    setLadderFormError("");

    setPendingConfirmation({
      type: "ladder",
      payload,
    });
  }

  async function saveStrikeLadder(
    confirmation: Extract<
      PendingConfirmation,
      {
        type: "ladder";
      }
    >
  ) {
    try {
      setIsSavingLadder(true);
      setPageError("");
      setLadderFormError("");

      const response =
        await apiRequest<
          MutationResponse<
            StrikeLadderVersion
          >
        >(
          "/api/strike-ladder",
          {
            method: "POST",

            body:
              JSON.stringify(
                confirmation.payload
              ),
          }
        );

      setPendingConfirmation(
        null
      );

      setCurrentLadder(
        response.data
      );

      setShowLadderEditor(
        false
      );

      setLadderDuration("");
      setLadderDraftSteps([]);
      setLadderHistory([]);

      toast.success(
        response.message,
        response.data.isCurrent
          ? `Strike ladder v${response.data.versionNumber} is current`
          : "Strike ladder saved"
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update strike ladder";

      setPendingConfirmation(
        null
      );

      setLadderFormError(
        message
      );

      toast.error(
        message,
        "Strike ladder not saved"
      );
    } finally {
      setIsSavingLadder(
        false
      );
    }
  }

  async function openLadderHistory() {
    try {
      setLadderHistoryLoading(
        true
      );

      setPageError("");
      setShowLadderHistory(
        true
      );

      const response =
        await apiRequest<
          OptionListResponse<
            StrikeLadderVersion
          >
        >(
          "/api/strike-ladder/history"
        );

      setLadderHistory(
        response.data
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load strike ladder history";

      setShowLadderHistory(
        false
      );

      setPageError(
        message
      );

      toast.error(
        message,
        "Unable to load ladder history"
      );
    } finally {
      setLadderHistoryLoading(
        false
      );
    }
  }

  function closeLadderHistory() {
    if (
      ladderHistoryLoading
    ) {
      return;
    }

    setShowLadderHistory(
      false
    );
  }

  /*
   * =========================================================
   * CONFIRMATION HANDLING
   * =========================================================
   */

  async function confirmPendingAction() {
    if (
      !pendingConfirmation
    ) {
      return;
    }

    if (
      pendingConfirmation.type ===
      "save"
    ) {
      await saveOption(
        pendingConfirmation
      );

      return;
    }

    if (
      pendingConfirmation.type ===
      "status"
    ) {
      await changeStatus(
        pendingConfirmation
      );

      return;
    }

    if (
      pendingConfirmation.type ===
      "ladder"
    ) {
      await saveStrikeLadder(
        pendingConfirmation
      );

      return;
    }

    await saveOrder(
      pendingConfirmation.kind
    );
  }

  function cancelConfirmation() {
    if (
      isSaving ||
      isSavingOrder ||
      isSavingLadder ||
      actionId !== null
    ) {
      return;
    }

    setPendingConfirmation(
      null
    );
  }

  function getConfirmationContent() {
    if (
      !pendingConfirmation
    ) {
      return null;
    }

    if (
      pendingConfirmation.type ===
      "save"
    ) {
      const label =
        pendingConfirmation.kind ===
        "severity"
          ? "Severity"
          : "Weight";

      if (
        pendingConfirmation.mode ===
        "create"
      ) {
        return {
          title:
            `Add ${label}?`,

          message:
            `Add "${pendingConfirmation.payload.name}" to the ${pendingConfirmation.kind === "severity" ? "severity levels" : "strike weights"}?`,

          confirmLabel:
            `Add ${label}`,

          danger: false,
        };
      }

      return {
        title:
          `Save ${label} Changes?`,

        message:
          `Save the changes to "${pendingConfirmation.payload.name}"?`,

        confirmLabel:
          "Save Changes",

        danger: false,
      };
    }

    if (
      pendingConfirmation.type ===
      "status"
    ) {
      const label =
        pendingConfirmation.kind ===
        "severity"
          ? "severity"
          : "weight";

      if (
        pendingConfirmation.action ===
        "archive"
      ) {
        return {
          title:
            `Archive ${label === "severity" ? "Severity" : "Weight"}?`,

          message:
            `Archive "${pendingConfirmation.option.name}"? It will no longer be available for new rule configuration, but historical rule and incident records will remain preserved.`,

          confirmLabel:
            "Archive",

          danger: true,
        };
      }

      return {
        title:
          `Reactivate ${label === "severity" ? "Severity" : "Weight"}?`,

        message:
          `Reactivate "${pendingConfirmation.option.name}"? It will become available for rule configuration again.`,

        confirmLabel:
          "Reactivate",

        danger: false,
      };
    }

    if (
      pendingConfirmation.type ===
      "ladder"
    ) {
      return {
        title:
          "Create New Strike Ladder Version?",

        message:
          "Save these changes as a new immutable strike ladder version? The previous ladder versions will remain preserved for audit history.",

        confirmLabel:
          "Create New Version",

        danger: false,
      };
    }

    return {
      title:
        pendingConfirmation.kind ===
        "severity"
          ? "Save Severity Order?"
          : "Save Weight Order?",

      message:
        pendingConfirmation.kind ===
        "severity"
          ? "Save the current severity level order? This will become the order shown throughout configuration."
          : "Save the current weight order? This will become the order shown throughout rule configuration.",

      confirmLabel:
        "Save Order",

      danger: false,
    };
  }

  const confirmationContent =
    getConfirmationContent();

  const confirmationBelongsToMode =
    pendingConfirmation
      ? mode ===
          "strikes"
        ? pendingConfirmation.type ===
          "ladder"
        : pendingConfirmation.type !==
          "ladder"
      : false;

  const confirmationBusy =
    pendingConfirmation?.type ===
    "save"
      ? isSaving
      : pendingConfirmation?.type ===
          "order"
        ? isSavingOrder
        : pendingConfirmation?.type ===
            "status"
          ? actionId ===
            pendingConfirmation.option.id
          : pendingConfirmation?.type ===
              "ladder"
            ? isSavingLadder
            : false;

  /*
   * =========================================================
   * REORDER HEADER CONTROLS
   * =========================================================
   */

  function renderReorderControls(
    kind: OptionKind
  ) {
    if (
      reorderKind !== kind
    ) {
      return null;
    }

    return (
      <div className="reorder-controls">
        <button
          type="button"
          className="secondary-button"
          onClick={
            cancelReorder
          }
          disabled={
            isSavingOrder
          }
        >
          Cancel
        </button>

        <button
          type="button"
          className="primary-button"
          onClick={() =>
            requestSaveOrder(
              kind
            )
          }
          disabled={
            isSavingOrder
          }
        >
          {isSavingOrder
            ? "Saving..."
            : "Save Order"}
        </button>
      </div>
    );
  }

  /*
   * =========================================================
   * SETTINGS ICON
   * =========================================================
   */

  function GearIcon() {
    return (
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="
            M19.43 12.98
            c.04-.32.07-.65.07-.98
            s-.03-.66-.07-.98
            l2.11-1.65
            -2-3.46
            -2.49 1
            a7.7 7.7 0 0 0-1.69-.98
            L15 3.25
            h-4
            l-.38 2.68
            c-.61.25-1.17.58-1.69.98
            l-2.49-1
            -2 3.46
            2.11 1.65
            c-.04.32-.07.65-.07.98
            s.03.66.07.98
            l-2.11 1.65
            2 3.46
            2.49-1
            c.52.4 1.08.73 1.69.98
            L11 20.75
            h4
            l.38-2.68
            c.61-.25 1.17-.58 1.69-.98
            l2.49 1
            2-3.46
            -2.11-1.65
            Z
          "
        />

        <circle
          cx="13"
          cy="12"
          r="3.25"
        />
      </svg>
    );
  }

  /*
   * =========================================================
   * HEADER ACTIONS
   * =========================================================
   */

  function renderHeaderActions(
    kind: OptionKind
  ) {
    if (
      reorderKind === kind
    ) {
      return renderReorderControls(
        kind
      );
    }

    const isDisabled =
      reorderKind !== null ||
      isSavingOrder;

    const options =
      kind === "severity"
        ? activeSeverityOptions
        : activeWeightOptions;

    return (
      <div className="configuration-header-actions">
        <button
          className="secondary-button configuration-add-button"
          type="button"
          onClick={() =>
            openAddForm(kind)
          }
          disabled={
            isDisabled
          }
        >
          {kind === "severity"
            ? "Add Severity"
            : "Add Weight"}
        </button>

        <div
          className="configuration-settings-wrapper"
          data-config-settings-menu
        >
          <button
            type="button"
            className="configuration-gear-button"
            onClick={() =>
              toggleSettingsMenu(
                kind
              )
            }
            disabled={
              isDisabled
            }
            aria-label={
              kind === "severity"
                ? "Severity settings"
                : "Weight settings"
            }
            aria-haspopup="menu"
            aria-expanded={
              settingsMenuKind ===
              kind
            }
            title="Settings"
          >
            <GearIcon />
          </button>

          {settingsMenuKind ===
            kind && (
            <div
              className="configuration-settings-menu"
              role="menu"
            >
              <button
                type="button"
                className="configuration-settings-item"
                role="menuitem"
                disabled={
                  options.length <
                  2
                }
                onClick={() =>
                  beginReorder(
                    kind
                  )
                }
              >
                <span className="settings-item-icon">
                  ↕
                </span>

                <span>
                  {kind ===
                  "severity"
                    ? "Reorder severity levels"
                    : "Reorder weights"}
                </span>
              </button>

              <button
                type="button"
                className="configuration-settings-item"
                role="menuitem"
                onClick={() =>
                  openArchiveModal(
                    kind
                  )
                }
              >
                <span className="settings-item-icon">
                  ▣
                </span>

                <span>
                  {kind ===
                  "severity"
                    ? `Archived (${archivedSeverityOptions.length})`
                    : `Archived (${archivedWeightOptions.length})`}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /*
   * =========================================================
   * PAGE
   * =========================================================
   */

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">
            {mode ===
            "rules"
              ? "Rule configuration"
              : "Disciplinary configuration"}
          </p>

          <h2>
            {mode ===
            "rules"
              ? "Rule Settings"
              : "Strike Ladder Configuration"}
          </h2>

          <p className="page-description">
            {mode ===
            "rules"
              ? "Manage severity and weight options used when configuring QA rules."
              : "Manage the global Strike Ladder used to calculate disciplinary standing and deductions."}
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            navigate(
              mode === "rules"
                ? "/rules"
                : "/strikes"
            )
          }
        >
          ← Back to {mode === "rules"
            ? "Rules"
            : "Strike Management"}
        </button>
      </header>

      {pageError && (
        <div className="alert alert-error page-alert">
          {pageError}
        </div>
      )}

      {mode === "rules" && (
        <div className="two-column-grid">
        {/* =================================================
            SEVERITY
            ================================================= */}

        <section className="content-card">
          <div className="card-header configuration-card-header">
            <div>
              <h3>
                Severity Levels
              </h3>

              <p>
                {reorderKind ===
                "severity"
                  ? "Drag severity levels into the order you want, then save."
                  : "Manage severity options available when creating rules."}
              </p>
            </div>

            {renderHeaderActions(
              "severity"
            )}
          </div>

          {isLoading ? (
            <div className="empty-state">
              <strong>
                Loading severity
                options...
              </strong>
            </div>
          ) : activeSeverityOptions.length ===
            0 ? (
            <div className="empty-state">
              <strong>
                No severity options
              </strong>

              <span>
                Add your first
                severity level.
              </span>
            </div>
          ) : (
            <div
              className={
                reorderKind ===
                "severity"
                  ? "config-list reorder-list active"
                  : "config-list"
              }
            >
              {activeSeverityOptions.map(
                (option) => (
                  <div
                    key={
                      option.id
                    }
                    className={[
                      "config-item",

                      reorderKind ===
                      "severity"
                        ? "reorder-item"
                        : "",

                      draggedId ===
                      option.id
                        ? "dragging"
                        : "",

                      dragOverId ===
                        option.id &&
                      draggedId !==
                        option.id
                        ? "drag-over"
                        : "",

                      lastMovedId ===
                      option.id
                        ? "just-dropped"
                        : "",
                    ]
                      .filter(
                        Boolean
                      )
                      .join(" ")}
                    onDragOver={(
                      event
                    ) =>
                      handleDragOver(
                        event,
                        "severity",
                        option.id
                      )
                    }
                    onDrop={(
                      event
                    ) =>
                      handleDrop(
                        event,
                        "severity",
                        option.id
                      )
                    }
                  >
                    <div className="config-item-main">
                      <div className="config-item-header">
                        <strong>
                          {option.name}
                        </strong>
                      </div>

                      {reorderKind !==
                        "severity" && (
                        <div className="config-row-status">
                          <span
                            className={
                              option.isActive
                                ? "status-badge active"
                                : "status-badge inactive"
                            }
                          >
                            {option.isActive
                              ? "Active"
                              : "Archived"}
                          </span>
                        </div>
                      )}

                      <p className="config-description">
                        {option.description ||
                          "No description provided."}
                      </p>
                    </div>

                    {reorderKind ===
                    "severity" ? (
                      <div
                        className="drag-handle"
                        draggable={
                          !isSavingOrder
                        }
                        onDragStart={(
                          event
                        ) =>
                          handleDragStart(
                            event,
                            "severity",
                            option.id
                          )
                        }
                        onDragEnd={
                          handleDragEnd
                        }
                        title="Drag to reorder"
                        aria-label={`Drag ${option.name} to reorder`}
                      >
                        <span
                          aria-hidden="true"
                          className="drag-grip"
                        >
                          ⋮⋮
                        </span>
                      </div>
                    ) : (
                      <div className="config-actions">
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            openEditForm(
                              "severity",
                              option
                            )
                          }
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className={
                            option.isActive
                              ? "text-button danger"
                              : "text-button success"
                          }
                          disabled={
                            actionId ===
                            option.id
                          }
                          onClick={() =>
                            requestStatusChange(
                              "severity",
                              option
                            )
                          }
                        >
                          {actionId ===
                          option.id
                            ? "Updating..."
                            : option.isActive
                              ? "Archive"
                              : "Reactivate"}
                        </button>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}
        </section>

        {/* =================================================
            WEIGHTS
            ================================================= */}

        <section className="content-card">
          <div className="card-header configuration-card-header">
            <div>
              <h3>
                Weights
              </h3>

              <p>
                {reorderKind ===
                "weight"
                  ? "Drag strike weights into the order you want, then save."
                  : "Manage configurable weight labels and values."}
              </p>
            </div>

            {renderHeaderActions(
              "weight"
            )}
          </div>

          {isLoading ? (
            <div className="empty-state">
              <strong>
                Loading weight
                options...
              </strong>
            </div>
          ) : activeWeightOptions.length ===
            0 ? (
            <div className="empty-state">
              <strong>
                No weight options
              </strong>

              <span>
                Add your first
                strike weight.
              </span>
            </div>
          ) : (
            <div
              className={
                reorderKind ===
                "weight"
                  ? "config-list reorder-list active"
                  : "config-list"
              }
            >
              {activeWeightOptions.map(
                (option) => (
                  <div
                    key={
                      option.id
                    }
                    className={[
                      "config-item",

                      reorderKind ===
                      "weight"
                        ? "reorder-item"
                        : "",

                      draggedId ===
                      option.id
                        ? "dragging"
                        : "",

                      dragOverId ===
                        option.id &&
                      draggedId !==
                        option.id
                        ? "drag-over"
                        : "",

                      lastMovedId ===
                      option.id
                        ? "just-dropped"
                        : "",
                    ]
                      .filter(
                        Boolean
                      )
                      .join(" ")}
                    onDragOver={(
                      event
                    ) =>
                      handleDragOver(
                        event,
                        "weight",
                        option.id
                      )
                    }
                    onDrop={(
                      event
                    ) =>
                      handleDrop(
                        event,
                        "weight",
                        option.id
                      )
                    }
                  >
                    <div className="config-item-main">
                      <div className="config-item-header">
                        <div className="config-title-row">
                          <strong>
                            {option.name}
                          </strong>

                          {option.value !==
                            null && (
                            <span className="weight-value">
                              {option.value}
                            </span>
                          )}
                        </div>
                      </div>

                      {reorderKind !==
                        "weight" && (
                        <div className="config-row-status">
                          <span
                            className={
                              option.isActive
                                ? "status-badge active"
                                : "status-badge inactive"
                            }
                          >
                            {option.isActive
                              ? "Active"
                              : "Archived"}
                          </span>
                        </div>
                      )}

                      <p className="config-description">
                        {option.description ||
                          "No description provided."}
                      </p>
                    </div>

                    {reorderKind ===
                    "weight" ? (
                      <div
                        className="drag-handle"
                        draggable={
                          !isSavingOrder
                        }
                        onDragStart={(
                          event
                        ) =>
                          handleDragStart(
                            event,
                            "weight",
                            option.id
                          )
                        }
                        onDragEnd={
                          handleDragEnd
                        }
                        title="Drag to reorder"
                        aria-label={`Drag ${option.name} to reorder`}
                      >
                        <span
                          aria-hidden="true"
                          className="drag-grip"
                        >
                          ⋮⋮
                        </span>
                      </div>
                    ) : (
                      <div className="config-actions">
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            openEditForm(
                              "weight",
                              option
                            )
                          }
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className={
                            option.isActive
                              ? "text-button danger"
                              : "text-button success"
                          }
                          disabled={
                            actionId ===
                            option.id
                          }
                          onClick={() =>
                            requestStatusChange(
                              "weight",
                              option
                            )
                          }
                        >
                          {actionId ===
                          option.id
                            ? "Updating..."
                            : option.isActive
                              ? "Archive"
                              : "Reactivate"}
                        </button>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}
        </section>
        </div>
      )}

      {mode === "strikes" && (
        <section className="content-card strike-ladder-card">
        <div className="card-header configuration-card-header strike-ladder-card-header">
          <div>
            <div className="strike-ladder-title-line">
              <h3>
                Strike Ladder
              </h3>

              {currentLadder && (
                <span className="strike-ladder-version-badge">
                  v
                  {
                    currentLadder.versionNumber
                  }
                  {" "}
                  Current
                </span>
              )}
            </div>

            <p>
              Configure how active
              strikes translate into
              standing and commission
              deductions.
            </p>
          </div>

          <div className="strike-ladder-header-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                void openLadderHistory()
              }
              disabled={
                isLoading ||
                ladderHistoryLoading
              }
            >
              {ladderHistoryLoading
                ? "Loading..."
                : "Version History"}
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={
                openLadderEditor
              }
              disabled={
                isLoading ||
                !currentLadder
              }
            >
              Edit Ladder
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="empty-state">
            <strong>
              Loading strike
              ladder...
            </strong>
          </div>
        ) : !currentLadder ? (
          <div className="empty-state">
            <strong>
              Strike ladder unavailable
            </strong>

            <span>
              The current strike
              ladder could not be
              loaded.
            </span>
          </div>
        ) : (
          <div className="strike-ladder-content">
            <div className="strike-ladder-meta-grid">
              <div className="strike-ladder-meta-card">
                <span>
                  Current Version
                </span>

                <strong>
                  v
                  {
                    currentLadder.versionNumber
                  }
                </strong>
              </div>

              <div className="strike-ladder-meta-card">
                <span>
                  Strike Duration
                </span>

                <strong>
                  {
                    currentLadder.durationDays
                  }{" "}
                  {currentLadder.durationDays ===
                  1
                    ? "day"
                    : "days"}
                </strong>
              </div>

              <div className="strike-ladder-meta-card">
                <span>
                  Ladder Steps
                </span>

                <strong>
                  {
                    Math.max(
                      0,
                      currentLadder.steps.length - 1
                    )
                  }
                </strong>
              </div>
            </div>

            <div className="strike-ladder-table">
              <div className="strike-ladder-table-header">
                <span>
                  Active Strikes
                </span>

                <span>
                  Standing
                </span>

                <span>
                  Deduction
                </span>
              </div>

              {[...currentLadder.steps]
                .filter(
                  (step) =>
                    step.minActiveStrikes > 0
                )
                .sort(
                  (
                    first,
                    second
                  ) =>
                    first.minActiveStrikes -
                    second.minActiveStrikes
                )
                .map(
                  (
                    step,
                    index,
                    steps
                  ) => (
                    <div
                      className="strike-ladder-table-row"
                      key={
                        step.id
                      }
                    >
                      <strong className="strike-ladder-threshold">
                        {formatThresholdRange(
                          steps,
                          index
                        )}
                      </strong>

                      <span className="strike-ladder-standing">
                        {
                          step.standingLabel
                        }
                      </span>

                      <strong className="strike-ladder-deduction">
                        {formatDeduction(
                          step.deductionPercent
                        )}
                        %
                      </strong>
                    </div>
                  )
                )}
            </div>

            <p className="strike-ladder-footnote">
              Each threshold applies
              until the next configured
              threshold. The highest
              threshold automatically
              applies to that number of
              strikes and above.
            </p>
          </div>
        )}
        </section>
      )}

      {/* =====================================================
          ARCHIVE MODAL
          ===================================================== */}

      {mode === "rules" &&
        archiveModalKind && (
        <div
          className="modal-backdrop"
          onMouseDown={
            closeArchiveModal
          }
        >
          <div
            className="modal modal-history configuration-archive-modal"
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <h3>
                  {archiveModalKind ===
                  "severity"
                    ? "Archived Severity"
                    : "Archived Weights"}
                </h3>

                <p>
                  {archiveModalKind ===
                  "severity"
                    ? "Severity levels that are no longer available for new rule configuration."
                    : "Strike weights that are no longer available for new rule configuration."}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={
                  closeArchiveModal
                }
                disabled={
                  actionId !== null
                }
                aria-label="Close archive"
              >
                ×
              </button>
            </div>

            {isLoading ? (
              <div className="empty-state">
                <strong>
                  Loading archive...
                </strong>
              </div>
            ) : archiveModalKind ===
                "severity" ? (
              archivedSeverityOptions.length ===
              0 ? (
                <div className="empty-state">
                  <strong>
                    No archived severity levels
                  </strong>

                  <span>
                    Severity levels you archive will appear here.
                  </span>
                </div>
              ) : (
                <div className="config-list configuration-archive-list">
                  {archivedSeverityOptions.map(
                    (option) => (
                      <div
                        key={option.id}
                        className="config-item configuration-archive-item"
                      >
                        <div className="config-item-main">
                          <div className="config-item-header">
                            <strong>
                              {option.name}
                            </strong>
                          </div>

                          <p className="config-description">
                            {option.description ||
                              "No description provided."}
                          </p>

                          {option.archivedAt && (
                            <span className="config-meta">
                              Archived:{" "}
                              {formatCentralDateTime(option.archivedAt)}
                            </span>
                          )}
                        </div>

                        <div className="config-actions">
                          <button
                            type="button"
                            className="text-button success"
                            disabled={
                              actionId ===
                              option.id
                            }
                            onClick={() =>
                              requestStatusChange(
                                "severity",
                                option
                              )
                            }
                          >
                            {actionId ===
                            option.id
                              ? "Updating..."
                              : "Reactivate"}
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )
            ) : archivedWeightOptions.length ===
              0 ? (
              <div className="empty-state">
                <strong>
                  No archived weights
                </strong>

                <span>
                  Weights you archive will appear here.
                </span>
              </div>
            ) : (
              <div className="config-list configuration-archive-list">
                {archivedWeightOptions.map(
                  (option) => (
                    <div
                      key={option.id}
                      className="config-item configuration-archive-item"
                    >
                      <div className="config-item-main">
                        <div className="config-item-header">
                          <div className="config-title-row">
                            <strong>
                              {option.name}
                            </strong>

                            {option.value !==
                              null && (
                              <span className="weight-value">
                                {option.value}
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="config-description">
                          {option.description ||
                            "No description provided."}
                        </p>

                        {option.archivedAt && (
                          <span className="config-meta">
                            Archived:{" "}
                            {formatCentralDateTime(option.archivedAt)}
                          </span>
                        )}
                      </div>

                      <div className="config-actions">
                        <button
                          type="button"
                          className="text-button success"
                          disabled={
                            actionId ===
                            option.id
                          }
                          onClick={() =>
                            requestStatusChange(
                              "weight",
                              option
                            )
                          }
                        >
                          {actionId ===
                          option.id
                            ? "Updating..."
                            : "Reactivate"}
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================
          ADD / EDIT SEVERITY OR WEIGHT
          ===================================================== */}

      {mode === "rules" &&
        modalKind && (
        <div
          className="modal-backdrop"
          onMouseDown={
            closeModal
          }
        >
          <div
            className="modal"
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <h3>
                  {editingOption
                    ? "Edit"
                    : "Add"}{" "}

                  {modalKind ===
                  "severity"
                    ? "Severity"
                    : "Weight"}
                </h3>

                <p>
                  {modalKind ===
                  "severity"
                    ? "Configure a severity level used by rules."
                    : "Configure a weight option used by rules."}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={
                  closeModal
                }
                aria-label="Close"
                disabled={
                  isSaving
                }
              >
                ×
              </button>
            </div>

            <form
              className="modal-form"
              onSubmit={
                handleSubmit
              }
              noValidate
            >
              <div className="form-stack">
                <label className="form-field">
                  <span>
                    Name
                  </span>

                  <input
                    type="text"
                    value={name}
                    onChange={(
                      event
                    ) => {
                      setName(
                        event.target
                          .value
                      );

                      if (
                        formError
                      ) {
                        setFormError(
                          ""
                        );
                      }
                    }}
                    placeholder={
                      modalKind ===
                      "severity"
                        ? "Example: High"
                        : "Example: Major Strike"
                    }
                    maxLength={
                      100
                    }
                    autoFocus
                    disabled={
                      isSaving
                    }
                  />
                </label>

                {modalKind ===
                  "weight" && (
                  <label className="form-field">
                    <span>
                      Weight Value
                    </span>

                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={
                        weightValue
                      }
                      onChange={(
                        event
                      ) => {
                        setWeightValue(
                          event.target
                            .value
                        );

                        if (
                          formError
                        ) {
                          setFormError(
                            ""
                          );
                        }
                      }}
                      placeholder="Example: 2"
                      disabled={
                        isSaving
                      }
                    />
                  </label>
                )}

                <label className="form-field">
                  <span>
                    Description
                  </span>

                  <textarea
                    value={
                      description
                    }
                    onChange={(
                      event
                    ) => {
                      setDescription(
                        event.target
                          .value
                      );

                      if (
                        formError
                      ) {
                        setFormError(
                          ""
                        );
                      }
                    }}
                    placeholder="Describe when this option should be used"
                    maxLength={
                      500
                    }
                    rows={4}
                    disabled={
                      isSaving
                    }
                  />
                </label>
              </div>

              {formError && (
                <div className="alert alert-error">
                  {formError}
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    closeModal
                  }
                  disabled={
                    isSaving
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={
                    isSaving
                  }
                >
                  {isSaving
                    ? "Saving..."
                    : editingOption
                      ? "Save Changes"
                      : modalKind ===
                          "severity"
                        ? "Add Severity"
                        : "Add Weight"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================
          STRIKE LADDER EDITOR
          ===================================================== */}

      {mode === "strikes" &&
        showLadderEditor && (
        <div
          className="modal-backdrop"
          onMouseDown={
            closeLadderEditor
          }
        >
          <div
            className="modal modal-wide strike-ladder-editor-modal"
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <h3>
                  Edit Strike Ladder
                </h3>

                <p>
                  Saving changes creates
                  a new immutable ladder
                  version.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={
                  closeLadderEditor
                }
                aria-label="Close strike ladder editor"
                disabled={
                  isSavingLadder
                }
              >
                ×
              </button>
            </div>

            <form
              className="modal-form strike-ladder-editor-form"
              onSubmit={
                handleLadderSubmit
              }
              noValidate
            >
              <div className="strike-ladder-duration-row">
                <label className="form-field">
                  <span>
                    Strike Duration
                  </span>

                  <div className="strike-ladder-duration-input">
                    <input
                      type="number"
                      min="1"
                      max="365"
                      step="1"
                      value={
                        ladderDuration
                      }
                      onChange={(
                        event
                      ) => {
                        setLadderDuration(
                          event.target
                            .value
                        );

                        if (
                          ladderFormError
                        ) {
                          setLadderFormError(
                            ""
                          );
                        }
                      }}
                      disabled={
                        isSavingLadder
                      }
                    />

                    <span>
                      days
                    </span>
                  </div>
                </label>

                <p>
                  Changing the duration
                  applies to newly issued
                  Strikes. Existing Strike
                  expiry dates remain
                  unchanged.
                </p>
              </div>

              <div className="strike-ladder-editor-heading">
                <div>
                  <span>
                    Ladder Steps
                  </span>

                  <p>
                    Configure the standing
                    and deduction applied
                    at each active-strike
                    level.
                  </p>
                </div>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    addLadderStep
                  }
                  disabled={
                    isSavingLadder
                  }
                >
                  Add Step
                </button>
              </div>

              <div className="strike-ladder-editor-list">
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
              </div>

              {ladderFormError && (
                <div className="alert alert-error">
                  {
                    ladderFormError
                  }
                </div>
              )}

              <div className="strike-ladder-editor-note">
                <strong>
                  Versioned configuration
                </strong>

                <span>
                  Previous ladder versions
                  are never overwritten.
                  Saving creates a new
                  current version and keeps
                  the old policy available
                  in history.
                </span>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    closeLadderEditor
                  }
                  disabled={
                    isSavingLadder
                  }
                >
                  Cancel
                </button>

                {ladderHasChanges && (
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={
                      isSavingLadder
                    }
                  >
                    {isSavingLadder
                      ? "Saving..."
                      : "Save New Version"}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================
          STRIKE LADDER HISTORY
          ===================================================== */}

      {mode === "strikes" &&
        showLadderHistory && (
        <div
          className="modal-backdrop"
          onMouseDown={
            closeLadderHistory
          }
        >
          <div
            className="modal modal-history strike-ladder-history-modal"
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <h3>
                  Strike Ladder
                  Version History
                </h3>

                <p>
                  Previous configurations
                  are preserved as
                  read-only audit history.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={
                  closeLadderHistory
                }
                aria-label="Close ladder history"
                disabled={
                  ladderHistoryLoading
                }
              >
                ×
              </button>
            </div>

            {ladderHistoryLoading ? (
              <div className="empty-state">
                <strong>
                  Loading ladder
                  history...
                </strong>
              </div>
            ) : ladderHistory.length ===
              0 ? (
              <div className="empty-state">
                <strong>
                  No ladder history
                </strong>
              </div>
            ) : (
              <div className="strike-ladder-history-list">
                {ladderHistory.map(
                  (version) => {
                    const orderedSteps =
                      [...version.steps]
                        .filter(
                          (step) =>
                            step.minActiveStrikes > 0
                        )
                        .sort(
                          (
                            first,
                            second
                          ) =>
                            first.minActiveStrikes -
                            second.minActiveStrikes
                        );

                    return (
                      <article
                        className={
                          version.isCurrent
                            ? "strike-ladder-history-item current"
                            : "strike-ladder-history-item"
                        }
                        key={
                          version.id
                        }
                      >
                        <div className="strike-ladder-history-item-header">
                          <div>
                            <div className="strike-ladder-history-version-line">
                              <strong>
                                Version{" "}
                                {
                                  version.versionNumber
                                }
                              </strong>

                              {version.isCurrent && (
                                <span className="strike-ladder-version-badge">
                                  Current
                                </span>
                              )}
                            </div>

                            <span>
                              {
                                version.durationDays
                              }{" "}
                              {version.durationDays ===
                              1
                                ? "day"
                                : "days"}{" "}
                              strike duration
                            </span>
                          </div>

                          <time>
                            {formatCentralDateTime(version.createdAt)}
                          </time>
                        </div>

                        <div className="strike-ladder-history-steps">
                          {orderedSteps.map(
                            (
                              step,
                              index
                            ) => (
                              <div
                                key={
                                  step.id
                                }
                                className="strike-ladder-history-step"
                              >
                                <strong>
                                  {formatThresholdRange(
                                    orderedSteps,
                                    index
                                  )}
                                </strong>

                                <span>
                                  {
                                    step.standingLabel
                                  }
                                </span>

                                <strong>
                                  {formatDeduction(
                                    step.deductionPercent
                                  )}
                                  %
                                </strong>
                              </div>
                            )
                          )}
                        </div>
                      </article>
                    );
                  }
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================
          CONFIRMATION MODAL
          ===================================================== */}

      {pendingConfirmation &&
        confirmationBelongsToMode &&
        confirmationContent && (
          <div
            className="modal-backdrop confirmation-backdrop"
            onMouseDown={
              cancelConfirmation
            }
          >
            <div
              className="modal confirmation-modal"
              onMouseDown={(
                event
              ) =>
                event.stopPropagation()
              }
              role="dialog"
              aria-modal="true"
              aria-labelledby="configuration-confirmation-title"
            >
              <div className="modal-header">
                <div>
                  <h3 id="configuration-confirmation-title">
                    {
                      confirmationContent.title
                    }
                  </h3>

                  <p>
                    Please confirm
                    before continuing.
                  </p>
                </div>

                <button
                  type="button"
                  className="modal-close"
                  onClick={
                    cancelConfirmation
                  }
                  disabled={
                    confirmationBusy
                  }
                  aria-label="Close confirmation"
                >
                  ×
                </button>
              </div>

              <div className="confirmation-body">
                <p>
                  {
                    confirmationContent.message
                  }
                </p>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    cancelConfirmation
                  }
                  disabled={
                    confirmationBusy
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className={
                    confirmationContent.danger
                      ? "danger-button"
                      : "primary-button"
                  }
                  onClick={() =>
                    void confirmPendingAction()
                  }
                  disabled={
                    confirmationBusy
                  }
                >
                  {confirmationBusy
                    ? "Processing..."
                    : confirmationContent.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

export default ConfigurationPage;
