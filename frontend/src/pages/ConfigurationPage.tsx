import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  DragEvent,
  FormEvent,
} from "react";

import { apiRequest } from "../lib/api";
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

type OptionListResponse<T> = {
  data: T[];
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
    };

function ConfigurationPage() {
  const toast = useToast();

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
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    pageError,
    setPageError,
  ] = useState("");

  /*
   * =========================================================
   * ADD / EDIT FORM
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
   * SETTINGS MENU
   * =========================================================
   */

  const [
    settingsMenuKind,
    setSettingsMenuKind,
  ] =
    useState<OptionKind | null>(
      null
    );

  /*
   * Close a gear menu when the user clicks
   * anywhere outside that menu.
   */
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

  /*
   * Used to briefly highlight the
   * item after it has been dropped.
   */
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

  /*
   * Original arrangement is preserved
   * while reorder mode is active.
   *
   * Cancel restores this exact copy.
   */
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

  /*
   * =========================================================
   * LOAD CONFIGURATION
   * =========================================================
   */

  const loadOptions =
    useCallback(async () => {
      try {
        setIsLoading(true);

        setPageError("");

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
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load configuration";

        setPageError(
          message
        );

        toast.error(
          message,
          "Unable to load configuration"
        );
      } finally {
        setIsLoading(false);
      }
    }, [toast]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  /*
   * Clean up the temporary
   * "item placed" animation timer.
   */
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

  /*
   * =========================================================
   * FORM HELPERS
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
   * FORM VALIDATION
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

    /*
     * =========================
     * SEVERITY
     * =========================
     */

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

      /*
       * Do not send an edit request if
       * nothing actually changed.
       */
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

    /*
     * =========================
     * WEIGHT
     * =========================
     */

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

      await loadOptions();
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

      await loadOptions();
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

    /*
     * Clone the current order so that
     * Cancel can restore it exactly.
     */
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
    if (
      !reorderKind ||
      isSavingOrder
    ) {
      return;
    }

    if (
      reorderKind ===
      "severity"
    ) {
      setSeverityOptions(
        severityBackup
      );
    } else {
      setWeightOptions(
        weightBackup
      );
    }

    setReorderKind(null);

    setDraggedId(null);

    setDragOverId(null);

    setLastMovedId(null);

    setSeverityBackup([]);

    setWeightBackup([]);

    toast.info(
      "The unsaved order was discarded.",
      "Reorder cancelled"
    );
  }

  function normalizeSeverityOrder(
    options:
      SeverityOption[]
  ) {
    return options.map(
      (option, index) => ({
        ...option,

        sortOrder:
          index + 1,
      })
    );
  }

  function normalizeWeightOrder(
    options:
      WeightOption[]
  ) {
    return options.map(
      (option, index) => ({
        ...option,

        sortOrder:
          index + 1,
      })
    );
  }

  function moveOption(
    kind: OptionKind,
    sourceId: string,
    targetId: string
  ) {
    if (
      sourceId === targetId
    ) {
      return;
    }

    if (
      kind === "severity"
    ) {
      setSeverityOptions(
        (current) => {
          const sourceIndex =
            current.findIndex(
              (option) =>
                option.id ===
                sourceId
            );

          const targetIndex =
            current.findIndex(
              (option) =>
                option.id ===
                targetId
            );

          if (
            sourceIndex === -1 ||
            targetIndex === -1
          ) {
            return current;
          }

          const next = [
            ...current,
          ];

          const [moved] =
            next.splice(
              sourceIndex,
              1
            );

          next.splice(
            targetIndex,
            0,
            moved
          );

          return normalizeSeverityOrder(
            next
          );
        }
      );

      return;
    }

    setWeightOptions(
      (current) => {
        const sourceIndex =
          current.findIndex(
            (option) =>
              option.id ===
              sourceId
          );

        const targetIndex =
          current.findIndex(
            (option) =>
              option.id ===
              targetId
          );

        if (
          sourceIndex === -1 ||
          targetIndex === -1
        ) {
          return current;
        }

        const next = [
          ...current,
        ];

        const [moved] =
          next.splice(
            sourceIndex,
            1
          );

        next.splice(
          targetIndex,
          0,
          moved
        );

        return normalizeWeightOrder(
          next
        );
      }
    );
  }

  function flashPlacedItem(
    optionId: string
  ) {
    if (
      placedTimerRef.current !==
      null
    ) {
      window.clearTimeout(
        placedTimerRef.current
      );
    }

    setLastMovedId(
      optionId
    );

    placedTimerRef.current =
      window.setTimeout(
        () => {
          setLastMovedId(
            null
          );

          placedTimerRef.current =
            null;
        },
        900
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

    setLastMovedId(null);

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

  /*
   * Save Order is an important mutation,
   * so clicking it opens confirmation first.
   */
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

    await saveOrder(
      pendingConfirmation.kind
    );
  }

  function cancelConfirmation() {
    if (
      isSaving ||
      isSavingOrder ||
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

    /*
     * =========================
     * ADD / EDIT
     * =========================
     */

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

    /*
     * =========================
     * ARCHIVE / REACTIVATE
     * =========================
     */

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

    /*
     * =========================
     * SAVE ORDER
     * =========================
     */

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
          : "Save the current strike weight order? This will become the order shown throughout configuration.",

      confirmLabel:
        "Save Order",

      danger: false,
    };
  }

  const confirmationContent =
    getConfirmationContent();

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
   * GEAR ICON
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
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle
          cx="12"
          cy="12"
          r="3"
        />

        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20.3h-3v-.08a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.56-1.03H5.3v-3h.14A1.7 1.7 0 0 0 7 9.94a1.7 1.7 0 0 0-.34-1.88L6.6 8l2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.7 4.7v-.08h3v.08a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06L19.8 8l-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.96 11h.04v3h-.04A1.7 1.7 0 0 0 19.4 15Z" />
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
        ? severityOptions
        : weightOptions;

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
                    : "Reorder strike weights"}
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
            Configuration
          </p>

          <h2>
            Severity & Weight
          </h2>

          <p className="page-description">
            Configure the severity
            and strike-weight
            options used by rules.
            These values are stored
            in the database and are
            not hardcoded.
          </p>
        </div>
      </header>

      {pageError && (
        <div className="alert alert-error page-alert">
          {pageError}
        </div>
      )}

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
          ) : severityOptions.length ===
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
              {severityOptions.map(
                (
                  option,
                  index
                ) => (
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
{reorderKind !== "severity" && (
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

                      {reorderKind !==
                        "severity" && (
                        <span className="config-meta">
                          Position:{" "}
                          {index + 1}
                        </span>
                      )}
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
                        <span className="reorder-position">
                          {index +
                            1}
                        </span>

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
                Strike Weights
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
          ) : weightOptions.length ===
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
              {weightOptions.map(
                (
                  option,
                  index
                ) => (
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

    {option.value !== null && (
      <span className="weight-value">
        {option.value}
      </span>
    )}
  </div>
</div>
{reorderKind !== "weight" && (
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

                      {reorderKind !==
                        "weight" && (
                        <span className="config-meta">
                          Position:{" "}
                          {index + 1}
                        </span>
                      )}
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
                        <span className="reorder-position">
                          {index +
                            1}
                        </span>

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

      {/* =====================================================
          ADD / EDIT MODAL
          ===================================================== */}

      {modalKind && (
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
                    : "Configure a strike-weight option used by rules."}
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

                    <small className="form-helper">
                      Optional until
                      the final strike
                      tally is
                      confirmed.
                    </small>
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

                <div className="reorder-form-note">
                  <strong>
                    Position
                  </strong>

                  <span>
                    New items are
                    added to the
                    bottom. Use the
                    settings menu on
                    the Configuration
                    page to change
                    their position.
                  </span>
                </div>
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
          CONFIRMATION MODAL
          ===================================================== */}

      {pendingConfirmation &&
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
                    before
                    continuing.
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