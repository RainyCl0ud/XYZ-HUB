import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type FormEvent,
} from "react";

import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  useAuth,
} from "../auth/AuthContext";

import {
  getPortalCapabilities,
} from "../auth/portalAccess";

import {
  apiRequest,
} from "../lib/api";

import {
  formatCentralDateTime,
} from "../lib/time";

import {
  useToast,
} from "../components/ToastProvider";

import "./StrikesPage.css";

type StrikeStatus =
  | "ACTIVE"
  | "EXPIRED"
  | "VOIDED";

type StrikeRecord = {
  id: string;

  status:
    StrikeStatus;

  userId:
    string | null;

  userNameSnapshot:
    string;

  userEmailSnapshot:
    string;

  currentUser:
    | {
        id: string;
        name: string;
        email: string;
        status: string;
      }
    | null;

  issuedByUserId:
    string | null;

  issuedByNameSnapshot:
    string;

  reasonId:
    string;

  reasonNameSnapshot:
    string;

  reasonDescriptionSnapshot:
    string | null;

  details:
    string;

  evidenceUrl:
    string | null;

  issuedAt:
    string;

  expiresAt:
    string;

  ladderVersionId:
    string;

  ladderVersion:
    number;

  activeStrikeCountAfterIssue:
    number;

  standingLabelSnapshot:
    string;

  deductionPercentSnapshot:
    number;

  voidedAt:
    string | null;

  voidedByUserId:
    string | null;

  voidedByNameSnapshot:
    string | null;

  voidReason:
    string | null;

  createdAt:
    string;

  updatedAt:
    string;
};

type EligibleStrikeTarget = {
  id: string;
  name: string;
  email: string;
};

type StrikeReason = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

type StrikePreview = {
  user: {
    id: string;
    name: string;
    email: string;
  };

  currentActiveStrikeCount:
    number;

  activeStrikeCountAfterIssue:
    number;

  standingLabel:
    string;

  deductionPercent:
    number;

  issuedAt:
    string;

  expiresAt:
    string;

  ladderVersionId:
    string;

  ladderVersion:
    number;

  durationDays:
    number;
};

type DataResponse<T> = {
  data: T;
};

type MutationResponse<T> = {
  message: string;
  data: T;
};

type StatusFilter =
  | "ALL"
  | StrikeStatus;

const STRIKES_PAGE_SIZE =
  8;

function getStatusLabel(
  status:
    StrikeStatus
) {
  switch (
    status
  ) {
    case "ACTIVE":
      return "Active";

    case "EXPIRED":
      return "Expired";

    case "VOIDED":
      return "Voided";

    default:
      return status;
  }
}

function getStatusClass(
  status:
    StrikeStatus
) {
  return `strike-status strike-status-${status.toLowerCase()}`;
}

function StrikesPage() {
  const navigate =
    useNavigate();

  const toast =
    useToast();

  const [
    searchParams,
    setSearchParams,
  ] =
    useSearchParams();

  const {
    access,
  } =
    useAuth();

  const capabilities =
    getPortalCapabilities(
      access
    );

  /*
   * Async request generations prevent responses from an
   * older modal session or employee selection from
   * overwriting the newest UI state.
   */
  const issueDataRequestIdRef =
    useRef(
      0
    );

  const previewRequestIdRef =
    useRef(
      0
    );

  /*
   * React state disables the button after render.
   * This ref locks immediately so rapid repeated clicks
   * cannot dispatch more than one Strike POST.
   */
  const issueSubmissionInFlightRef =
    useRef(
      false
    );

  const handoffKeyRef =
    useRef(
      ""
    );

  const [
    strikes,
    setStrikes,
  ] =
    useState<
      StrikeRecord[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    pageError,
    setPageError,
  ] =
    useState(
      ""
    );

  const [
    search,
    setSearch,
  ] =
    useState(
      ""
    );

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState<StatusFilter>(
      "ALL"
    );

  const [
    employeeFilter,
    setEmployeeFilter,
  ] =
    useState(
      "ALL"
    );

  const [
    reasonFilter,
    setReasonFilter,
  ] =
    useState(
      "ALL"
    );

  const [
    strikePage,
    setStrikePage,
  ] =
    useState(
      1
    );

  const [
    selectedStrike,
    setSelectedStrike,
  ] =
    useState<
      StrikeRecord | null
    >(
      null
    );

  const [
    issueOpen,
    setIssueOpen,
  ] =
    useState(
      false
    );

  const [
    issueDataLoading,
    setIssueDataLoading,
  ] =
    useState(
      false
    );

  const [
    eligibleUsers,
    setEligibleUsers,
  ] =
    useState<
      EligibleStrikeTarget[]
    >([]);

  const [
    reasons,
    setReasons,
  ] =
    useState<
      StrikeReason[]
    >([]);

  const [
    issueUserId,
    setIssueUserId,
  ] =
    useState(
      ""
    );

  const [
    issueReasonId,
    setIssueReasonId,
  ] =
    useState(
      ""
    );

  const [
    issueDetails,
    setIssueDetails,
  ] =
    useState(
      ""
    );

  const [
    issueEvidenceUrl,
    setIssueEvidenceUrl,
  ] =
    useState(
      ""
    );

  const [
    issuePreview,
    setIssuePreview,
  ] =
    useState<
      StrikePreview | null
    >(
      null
    );

  const [
    previewLoading,
    setPreviewLoading,
  ] =
    useState(
      false
    );

  const [
    issuing,
    setIssuing,
  ] =
    useState(
      false
    );

  const [
    issueConfirmationOpen,
    setIssueConfirmationOpen,
  ] =
    useState(
      false
    );

  const [
    issueError,
    setIssueError,
  ] =
    useState(
      ""
    );

  const [
    issueSourceIncidentId,
    setIssueSourceIncidentId,
  ] =
    useState<
      string | null
    >(
      null
    );

  const [
    voidTarget,
    setVoidTarget,
  ] =
    useState<
      StrikeRecord | null
    >(
      null
    );

  const [
    voidReason,
    setVoidReason,
  ] =
    useState(
      ""
    );

  const [
    voidError,
    setVoidError,
  ] =
    useState(
      ""
    );

  const [
    voiding,
    setVoiding,
  ] =
    useState(
      false
    );

  const loadStrikes =
    useCallback(
      async () => {
        try {
          setLoading(
            true
          );

          setPageError(
            ""
          );

          const response =
            await apiRequest<
              DataResponse<
                StrikeRecord[]
              >
            >(
              "/api/strikes"
            );

          setStrikes(
            response.data
          );
        } catch (
          error
        ) {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to load Strikes.";

          setPageError(
            message
          );

          toast.error(
            message,
            "Unable to load Strikes"
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      [
        toast,
      ]
    );

  useEffect(
    () => {
      const timerId =
        window.setTimeout(
          () => {
            void loadStrikes();
          },
          0
        );

      return () => {
        window.clearTimeout(
          timerId
        );
      };
    },
    [
      loadStrikes,
    ]
  );

  const activeCount =
    useMemo(
      () =>
        strikes.filter(
          (
            strike
          ) =>
            strike.status ===
            "ACTIVE"
        ).length,
      [
        strikes,
      ]
    );

  const expiredCount =
    useMemo(
      () =>
        strikes.filter(
          (
            strike
          ) =>
            strike.status ===
            "EXPIRED"
        ).length,
      [
        strikes,
      ]
    );

  const voidedCount =
    useMemo(
      () =>
        strikes.filter(
          (
            strike
          ) =>
            strike.status ===
            "VOIDED"
        ).length,
      [
        strikes,
      ]
    );

  const employees =
    useMemo(
      () => {
        const map =
          new Map<
            string,
            string
          >();

        for (
          const strike of strikes
        ) {
          map.set(
            strike.userEmailSnapshot,
            strike.userNameSnapshot
          );
        }

        return Array.from(
          map.entries()
        )
          .map(
            (
              [
                email,
                name,
              ]
            ) => ({
              email,
              name,
            })
          )
          .sort(
            (
              first,
              second
            ) =>
              first.name.localeCompare(
                second.name
              )
          );
      },
      [
        strikes,
      ]
    );

  const reasonOptions =
    useMemo(
      () => {
        const map =
          new Map<
            string,
            string
          >();

        for (
          const strike of strikes
        ) {
          map.set(
            strike.reasonId,
            strike.reasonNameSnapshot
          );
        }

        return Array.from(
          map.entries()
        )
          .map(
            (
              [
                id,
                name,
              ]
            ) => ({
              id,
              name,
            })
          )
          .sort(
            (
              first,
              second
            ) =>
              first.name.localeCompare(
                second.name
              )
          );
      },
      [
        strikes,
      ]
    );

  const filteredStrikes =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLowerCase();

        return strikes.filter(
          (
            strike
          ) => {
            if (
              statusFilter !==
                "ALL" &&
              strike.status !==
                statusFilter
            ) {
              return false;
            }

            if (
              employeeFilter !==
                "ALL" &&
              strike.userEmailSnapshot !==
                employeeFilter
            ) {
              return false;
            }

            if (
              reasonFilter !==
                "ALL" &&
              strike.reasonId !==
                reasonFilter
            ) {
              return false;
            }

            if (
              !query
            ) {
              return true;
            }

            return [
              strike.userNameSnapshot,
              strike.userEmailSnapshot,
              strike.reasonNameSnapshot,
              strike.issuedByNameSnapshot,
              strike.details,
              strike.standingLabelSnapshot,
            ]
              .filter(
                Boolean
              )
              .some(
                (
                  value
                ) =>
                  value
                    .toLowerCase()
                    .includes(
                      query
                    )
              );
          }
        );
      },
      [
        strikes,
        search,
        statusFilter,
        employeeFilter,
        reasonFilter,
      ]
    );

  const strikePageCount =
    Math.max(
      1,
      Math.ceil(
        filteredStrikes.length /
        STRIKES_PAGE_SIZE
      )
    );

  const resolvedStrikePage =
    Math.min(
      strikePage,
      strikePageCount
    );

  const paginatedStrikes =
    useMemo(
      () => {
        const start =
          (
            resolvedStrikePage -
            1
          ) *
          STRIKES_PAGE_SIZE;

        return filteredStrikes.slice(
          start,
          start +
            STRIKES_PAGE_SIZE
        );
      },
      [
        filteredStrikes,
        resolvedStrikePage,
      ]
    );


  function openEmployeeStrikeProfile(
    strike:
      StrikeRecord,
    returnToDetail =
      false
  ) {
    if (
      !capabilities.canManagePeople ||
      !strike.currentUser
    ) {
      return;
    }

    const params =
      new URLSearchParams();

    params.set(
      "tab",
      "strikes"
    );

    params.set(
      "from",
      returnToDetail
        ? `/strikes?strikeId=${strike.id}`
        : "/strikes"
    );

    navigate(
      `/people/${encodeURIComponent(
        strike.currentUser.id
      )}?${params.toString()}`
    );
  }


  function resetIssueForm() {
    previewRequestIdRef.current +=
      1;

    setPreviewLoading(
      false
    );

    setIssueUserId(
      ""
    );

    setIssueReasonId(
      ""
    );

    setIssueDetails(
      ""
    );

    setIssueEvidenceUrl(
      ""
    );

    setIssueSourceIncidentId(
      null
    );

    setIssueConfirmationOpen(
      false
    );

    setIssuePreview(
      null
    );

    setIssueError(
      ""
    );
  }

  async function openIssueModal(
    preselectedUserId?:
      string,
    sourceIncidentId?:
      string
  ) {
    const requestId =
      issueDataRequestIdRef.current +
      1;

    issueDataRequestIdRef.current =
      requestId;

    resetIssueForm();

    setIssueSourceIncidentId(
      sourceIncidentId ||
        null
    );

    /*
     * Never fall back to data from a previous modal
     * session if the fresh request fails.
     */
    setEligibleUsers(
      []
    );

    setReasons(
      []
    );

    setIssueOpen(
      true
    );

    setIssueDataLoading(
      true
    );

    try {
      const [
        usersResponse,
        reasonsResponse,
      ] =
        await Promise.all([
          apiRequest<
            DataResponse<
              EligibleStrikeTarget[]
            >
          >(
            "/api/strikes/eligible-users"
          ),

          apiRequest<
            DataResponse<
              StrikeReason[]
            >
          >(
            "/api/strike-reasons"
          ),
        ]);

      if (
        requestId !==
        issueDataRequestIdRef.current
      ) {
        return;
      }

      setEligibleUsers(
        usersResponse.data
      );

      setReasons(
        reasonsResponse.data
      );

      if (
        preselectedUserId
      ) {
        const employeeIsEligible =
          usersResponse.data.some(
            (
              user
            ) =>
              user.id ===
              preselectedUserId
          );

        if (
          !employeeIsEligible
        ) {
          setIssueError(
            "The employee linked to this QA incident is not currently eligible to receive a Strike."
          );

          return;
        }

        await handleIssueUserChange(
          preselectedUserId
        );
      }
    } catch (
      error
    ) {
      if (
        requestId !==
        issueDataRequestIdRef.current
      ) {
        return;
      }

      const message =
        error instanceof Error
          ? error.message
          : "Failed to load Strike issuance data.";

      setIssueError(
        message
      );

      toast.error(
        message,
        "Unable to prepare Strike"
      );
    } finally {
      if (
        requestId ===
        issueDataRequestIdRef.current
      ) {
        setIssueDataLoading(
          false
        );
      }
    }
  }

  function closeIssueModal() {
    if (
      issuing
    ) {
      return;
    }

    issueDataRequestIdRef.current +=
      1;

    previewRequestIdRef.current +=
      1;

    setIssueDataLoading(
      false
    );

    setPreviewLoading(
      false
    );

    setIssueOpen(
      false
    );

    resetIssueForm();
  }

  function returnToIssueForm() {
    if (
      issuing
    ) {
      return;
    }

    setIssueConfirmationOpen(
      false
    );

    setIssueError(
      ""
    );
  }

  async function handleIssueUserChange(
    userId:
      string
  ) {
    const requestId =
      previewRequestIdRef.current +
      1;

    previewRequestIdRef.current =
      requestId;

    setIssueUserId(
      userId
    );

    setIssuePreview(
      null
    );

    setIssueError(
      ""
    );

    if (
      !userId
    ) {
      setPreviewLoading(
        false
      );

      return;
    }

    setPreviewLoading(
      true
    );

    try {
      const response =
        await apiRequest<
          DataResponse<
            StrikePreview
          >
        >(
          "/api/strikes/preview",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                userId,
              }),
          }
        );

      if (
        requestId !==
        previewRequestIdRef.current
      ) {
        return;
      }

      /*
       * The server returns the employee identity as part
       * of the preview. Refuse to display a preview that
       * does not belong to the request that produced it.
       */
      if (
        response.data.user.id !==
        userId
      ) {
        setIssuePreview(
          null
        );

        setIssueError(
          "The Strike preview did not match the selected employee. Please select the employee again."
        );

        return;
      }

      setIssuePreview(
        response.data
      );
    } catch (
      error
    ) {
      if (
        requestId !==
        previewRequestIdRef.current
      ) {
        return;
      }

      const message =
        error instanceof Error
          ? error.message
          : "Unable to preview this Strike.";

      setIssueError(
        message
      );
    } finally {
      if (
        requestId ===
        previewRequestIdRef.current
      ) {
        setPreviewLoading(
          false
        );
      }
    }
  }

  const openIssueFromHandoff =
    useEffectEvent(
      (
        userId:
          string,
        sourceIncidentId:
          string
      ) => {
        void openIssueModal(
          userId,
          sourceIncidentId
        );
      }
    );

  const openStrikeFromHandoff =
    useEffectEvent(
      (
        strike:
          StrikeRecord
      ) => {
        setSelectedStrike(
          strike
        );
      }
    );

  useEffect(
    () => {
      const action =
        searchParams.get(
          "action"
        );

      const sourceIncidentId =
        searchParams.get(
          "sourceIncidentId"
        );

      const userId =
        searchParams.get(
          "userId"
        );

      const strikeId =
        searchParams.get(
          "strikeId"
        );

      if (
        !action &&
        !strikeId
      ) {
        return;
      }

      const handoffKey =
        [
          action || "",
          sourceIncidentId || "",
          userId || "",
          strikeId || "",
        ].join(
          "|"
        );

      function clearHandoffParams() {
        const nextParams =
          new URLSearchParams(
            searchParams
          );

        nextParams.delete(
          "action"
        );

        nextParams.delete(
          "sourceIncidentId"
        );

        nextParams.delete(
          "userId"
        );

        nextParams.delete(
          "strikeId"
        );

        setSearchParams(
          nextParams,
          {
            replace:
              true,
          }
        );
      }

      if (
        strikeId
      ) {
        if (
          loading
        ) {
          return;
        }

        if (
          handoffKeyRef.current ===
          handoffKey
        ) {
          return;
        }

        handoffKeyRef.current =
          handoffKey;

        const strike =
          strikes.find(
            (
              candidate
            ) =>
              candidate.id ===
              strikeId
          );

        if (
          !strike
        ) {
          toast.error(
            "The linked Strike could not be found or is no longer available.",
            "Unable to open Strike"
          );
        } else {
          window.setTimeout(
            () => {
              openStrikeFromHandoff(
                strike
              );
            },
            0
          );
        }

        clearHandoffParams();

        return;
      }

      if (
        action !==
        "issue"
      ) {
        return;
      }

      if (
        handoffKeyRef.current ===
        handoffKey
      ) {
        return;
      }

      handoffKeyRef.current =
        handoffKey;

      if (
        !sourceIncidentId ||
        !userId
      ) {
        toast.error(
          "The QA-to-Strike handoff is missing required incident or employee information.",
          "Unable to issue Strike"
        );

        clearHandoffParams();

        return;
      }

      if (
        !capabilities.canIssueStrikes
      ) {
        toast.error(
          "You do not have permission to issue Strikes.",
          "Strike access denied"
        );

        clearHandoffParams();

        return;
      }

      window.setTimeout(
        () => {
          openIssueFromHandoff(
            userId,
            sourceIncidentId
          );
        },
        0
      );

      clearHandoffParams();
    },
    [
      capabilities.canIssueStrikes,
      loading,
      searchParams,
      setSearchParams,
      strikes,
      toast,
    ]
  );

  function reviewStrike(
    event:
      FormEvent
  ) {
    event.preventDefault();

    if (
      !issueUserId ||
      !issueReasonId ||
      !issueDetails.trim()
    ) {
      setIssueError(
        issueSourceIncidentId
          ? "Chatter, reason, and Strike details are required."
          : "Employee, reason, and Strike details are required."
      );

      return;
    }

    if (
      !issuePreview ||
      issuePreview.user.id !==
        issueUserId
    ) {
      setIssueError(
        "Wait for the current employee's Strike consequence preview before continuing."
      );

      return;
    }

    const reasonStillAvailable =
      reasons.some(
        (
          reason
        ) =>
          reason.id ===
            issueReasonId &&
          reason.isActive
      );

    if (
      !reasonStillAvailable
    ) {
      setIssueError(
        "The selected Strike reason is no longer available. Please choose another reason."
      );

      return;
    }

    setIssueError(
      ""
    );

    setIssueConfirmationOpen(
      true
    );
  }

  async function confirmIssueStrike() {
    /*
     * Lock before the first await. This prevents two rapid
     * confirmation clicks from creating duplicate POSTs.
     */
    if (
      issueSubmissionInFlightRef.current ||
      issuing
    ) {
      return;
    }

    if (
      !issueUserId ||
      !issueReasonId ||
      !issueDetails.trim() ||
      !issuePreview ||
      issuePreview.user.id !==
        issueUserId
    ) {
      setIssueConfirmationOpen(
        false
      );

      setIssueError(
        "The Strike form changed or is incomplete. Review it again before issuing."
      );

      return;
    }

    const reasonStillAvailable =
      reasons.some(
        (
          reason
        ) =>
          reason.id ===
            issueReasonId &&
          reason.isActive
      );

    if (
      !reasonStillAvailable
    ) {
      setIssueConfirmationOpen(
        false
      );

      setIssueError(
        "The selected Strike reason is no longer available. Please choose another reason."
      );

      return;
    }

    issueSubmissionInFlightRef.current =
      true;

    setIssuing(
      true
    );

    setIssueError(
      ""
    );

    try {
      const response =
        await apiRequest<
          MutationResponse<
            StrikeRecord
          >
        >(
          "/api/strikes",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                userId:
                  issueUserId,

                reasonId:
                  issueReasonId,

                details:
                  issueDetails.trim(),

                evidenceUrl:
                  issueEvidenceUrl.trim() ||
                  null,

                ...(issueSourceIncidentId
                  ? {
                      sourceIncidentId:
                        issueSourceIncidentId,
                    }
                  : {}),
              }),
          }
        );

      setStrikes(
        (
          current
        ) => [
          response.data,
          ...current,
        ]
      );

      setIssueConfirmationOpen(
        false
      );

      setIssueOpen(
        false
      );

      resetIssueForm();

      toast.success(
        "The disciplinary Strike was issued and recorded.",
        "Strike issued"
      );
    } catch (
      error
    ) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to issue Strike.";

      setIssueError(
        message
      );

      toast.error(
        message,
        "Strike was not issued"
      );
    } finally {
      issueSubmissionInFlightRef.current =
        false;

      setIssuing(
        false
      );
    }
  }

  function openVoidModal(
    strike:
      StrikeRecord
  ) {
    /*
     * Do not leave the record-detail dialog mounted
     * underneath the destructive confirmation dialog.
     */
    setSelectedStrike(
      null
    );

    setVoidTarget(
      strike
    );

    setVoidReason(
      ""
    );

    setVoidError(
      ""
    );
  }

  function closeVoidModal() {
    if (
      voiding
    ) {
      return;
    }

    setVoidTarget(
      null
    );

    setVoidReason(
      ""
    );

    setVoidError(
      ""
    );
  }

  async function submitVoid(
    event:
      FormEvent
  ) {
    event.preventDefault();

    if (
      !voidTarget
    ) {
      return;
    }

    const normalizedReason =
      voidReason.trim();

    if (
      normalizedReason.length <
      3
    ) {
      setVoidError(
        "Void reason must be at least 3 characters."
      );

      return;
    }

    setVoiding(
      true
    );

    setVoidError(
      ""
    );

    try {
      const response =
        await apiRequest<
          MutationResponse<
            StrikeRecord
          >
        >(
          `/api/strikes/${voidTarget.id}/void`,
          {
            method:
              "POST",

            body:
              JSON.stringify({
                reason:
                  normalizedReason,
              }),
          }
        );

      setStrikes(
        (
          current
        ) =>
          current.map(
            (
              strike
            ) =>
              strike.id ===
              response.data.id
                ? response.data
                : strike
          )
      );

      setSelectedStrike(
        (
          current
        ) =>
          current?.id ===
          response.data.id
            ? response.data
            : current
      );

      setVoidTarget(
        null
      );

      setVoidReason(
        ""
      );

      toast.success(
        "The Strike was voided and preserved in disciplinary history.",
        "Strike voided"
      );
    } catch (
      error
    ) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to void Strike.";

      setVoidError(
        message
      );

      toast.error(
        message,
        "Strike was not voided"
      );
    } finally {
      setVoiding(
        false
      );
    }
  }

  const selectedIssueEmployee =
    eligibleUsers.find(
      (
        employee
      ) =>
        employee.id ===
        issueUserId
    ) ?? null;

  const selectedIssueReason =
    reasons.find(
      (
        reason
      ) =>
        reason.id ===
        issueReasonId
    ) ?? null;

  return (
    <div className="page strikes-page">
      <header className="page-header strikes-page-header">
        <div>
          <p className="page-eyebrow">
            Disciplinary management
          </p>

          <h2>
            Strike Management
          </h2>

          <p className="page-description">
            Issue and review disciplinary Strikes independently from Quality & Incidents.
          </p>
        </div>

        {(capabilities.canConfigureStrikes ||
          capabilities.canIssueStrikes) && (
          <div className="strikes-header-actions">
            {capabilities.canIssueStrikes && (
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  void openIssueModal();
                }}
              >
                Issue Strike
              </button>
            )}
            {capabilities.canConfigureStrikes && (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    navigate(
                      "/strikes/reasons"
                    )
                  }
                >
                  Manage Reasons
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    navigate(
                      "/strikes/settings"
                    )
                  }
                  aria-label="Strike Ladder Configuration"
                  title="Strike Ladder Configuration"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="3"
                    />

                    <path
                      d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.7.6Z"
                    />
                  </svg>
                </button>
              </>
            )}

          </div>
        )}
      </header>

      <section className="strikes-summary-grid">
        <article className="stat-card">
          <span className="stat-label">
            Total records
          </span>

          <strong className="stat-value">
            {strikes.length}
          </strong>

          <span className="stat-help">
            All visible disciplinary Strike records.
          </span>
        </article>

        <article className="stat-card">
          <span className="stat-label">
            Active
          </span>

          <strong className="stat-value">
            {activeCount}
          </strong>

          <span className="stat-help">
            Currently counting toward disciplinary standing.
          </span>
        </article>

        <article className="stat-card">
          <span className="stat-label">
            Expired
          </span>

          <strong className="stat-value">
            {expiredCount}
          </strong>

          <span className="stat-help">
            Preserved history outside the active window.
          </span>
        </article>

        <article className="stat-card">
          <span className="stat-label">
            Voided
          </span>

          <strong className="stat-value">
            {voidedCount}
          </strong>

          <span className="stat-help">
            Cancelled records retained for audit history.
          </span>
        </article>
      </section>

      <section className="content-card strikes-content-card">
        <div className="strikes-toolbar">
          <input
            type="search"
            className="search-input strikes-search"
            placeholder="Search employee, reason, issuer, or details"
            aria-label="Search Strikes"
            value={
              search
            }
            onChange={(
              event
            ) => {
              setSearch(
                event.target.value
              );

              setStrikePage(
                1
              );
            }}
          />

          <select
            className="strikes-filter-select"
            aria-label="Filter by employee"
            value={
              employeeFilter
            }
            onChange={(
              event
            ) => {
              setEmployeeFilter(
                event.target.value
              );

              setStrikePage(
                1
              );
            }}
          >
            <option value="ALL">
              All employees
            </option>

            {employees.map(
              (
                employee
              ) => (
                <option
                  key={
                    employee.email
                  }
                  value={
                    employee.email
                  }
                >
                  {employee.name}
                </option>
              )
            )}
          </select>

          <select
            className="strikes-filter-select"
            aria-label="Filter by reason"
            value={
              reasonFilter
            }
            onChange={(
              event
            ) => {
              setReasonFilter(
                event.target.value
              );

              setStrikePage(
                1
              );
            }}
          >
            <option value="ALL">
              All reasons
            </option>

            {reasonOptions.map(
              (
                reason
              ) => (
                <option
                  key={
                    reason.id
                  }
                  value={
                    reason.id
                  }
                >
                  {reason.name}
                </option>
              )
            )}
          </select>

          <select
            className="strikes-filter-select"
            aria-label="Filter by Strike status"
            value={
              statusFilter
            }
            onChange={(
              event
            ) => {
              setStatusFilter(
                event.target.value as
                  StatusFilter
              );

              setStrikePage(
                1
              );
            }}
          >
            <option value="ALL">
              All statuses
            </option>

            <option value="ACTIVE">
              Active
            </option>

            <option value="EXPIRED">
              Expired
            </option>

            <option value="VOIDED">
              Voided
            </option>
          </select>
        </div>

        {pageError && (
          <div className="strikes-inline-error">
            {pageError}
          </div>
        )}

        {loading ? (
          <div className="empty-state">
            <strong>
              Loading Strikes…
            </strong>
          </div>
        ) : filteredStrikes.length ===
          0 ? (
          <div className="empty-state">
            <strong>
              No matching Strikes
            </strong>

            <span>
              Try another search or filter selection.
            </span>
          </div>
        ) : (
          <div className="strikes-table-wrap">
            <div className="strikes-table strikes-table-head">
              <span>
                Employee
              </span>

              <span>
                Reason
              </span>

              <span>
                Standing
              </span>

              <span>
                Issued
              </span>

              <span>
                Status
              </span>

              <span>
                Action
              </span>
            </div>

            {paginatedStrikes.map(
              (
                strike
              ) => (
                <div
                  key={
                    strike.id
                  }
                  className="strikes-table strikes-table-row"
                >
                  <div className="strikes-person-cell">
                    {strike.currentUser &&
                    capabilities.canManagePeople ? (
                      <button
                        type="button"
                        className="strikes-employee-link"
                        onClick={() =>
                          openEmployeeStrikeProfile(
                            strike
                          )
                        }
                      >
                        {strike.userNameSnapshot}
                      </button>
                    ) : (
                      <strong>
                        {strike.userNameSnapshot}
                      </strong>
                    )}

                    <span>
                      {strike.userEmailSnapshot}
                    </span>
                  </div>

                  <div className="strikes-reason-cell">
                    <strong>
                      {strike.reasonNameSnapshot}
                    </strong>

                    <span>
                      Strike #{strike.activeStrikeCountAfterIssue} at issuance
                    </span>
                  </div>

                  <div className="strikes-standing-cell">
                    <strong>
                      {strike.standingLabelSnapshot}
                    </strong>

                    <span>
                      {strike.deductionPercentSnapshot > 0
                        ? `${strike.deductionPercentSnapshot}% deduction`
                        : "No deduction"}
                    </span>
                  </div>

                  <div className="strikes-date-cell">
                    <strong>
                      {formatCentralDateTime(
                        strike.issuedAt
                      )}
                    </strong>

                    <span>
                      by {strike.issuedByNameSnapshot}
                    </span>
                  </div>

                  <div>
                    <span
                      className={
                        getStatusClass(
                          strike.status
                        )
                      }
                    >
                      {getStatusLabel(
                        strike.status
                      )}
                    </span>
                  </div>

                  <div>
                    <button
                      type="button"
                      className="secondary-button strikes-view-button"
                      onClick={() =>
                        setSelectedStrike(
                          strike
                        )
                      }
                    >
                      View
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {filteredStrikes.length >
          0 && (
          <div
            className="strikes-pagination"
            aria-label="Strike records pagination"
          >
            <span>
              {filteredStrikes.length} total records
            </span>

            <div>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setStrikePage(
                    Math.max(
                      1,
                      resolvedStrikePage -
                        1
                    )
                  )
                }
                disabled={
                  resolvedStrikePage <=
                    1
                }
              >
                Previous
              </button>

              <strong>
                Page {resolvedStrikePage} of{" "}
                {strikePageCount}
              </strong>

              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setStrikePage(
                    Math.min(
                      strikePageCount,
                      resolvedStrikePage +
                        1
                    )
                  )
                }
                disabled={
                  resolvedStrikePage >=
                    strikePageCount
                }
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {selectedStrike && (
        <div
          className="strikes-overlay"
          role="presentation"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setSelectedStrike(
                null
              );
            }
          }}
        >
          <section
            className="strikes-modal strikes-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="strike-detail-title"
          >
            <div className="strikes-modal-header">
              <div>
                <span className="page-eyebrow">
                  Strike record
                </span>

                <h3 id="strike-detail-title">
                  {selectedStrike.userNameSnapshot}
                </h3>

                <p>
                  {selectedStrike.userEmailSnapshot}
                </p>
              </div>

              <button
                type="button"
                className="strikes-close"
                aria-label="Close Strike details"
                onClick={() =>
                  setSelectedStrike(
                    null
                  )
                }
              >
                ×
              </button>
            </div>

            <div className="strikes-modal-body">
              <div className="strikes-detail-summary">
                <div>
                  <span>
                    Status
                  </span>

                  <strong
                    className={
                      getStatusClass(
                        selectedStrike.status
                      )
                    }
                  >
                    {getStatusLabel(
                      selectedStrike.status
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Standing
                  </span>

                  <strong>
                    {selectedStrike.standingLabelSnapshot}
                  </strong>
                </div>

                <div>
                  <span>
                    Active count after issue
                  </span>

                  <strong>
                    {selectedStrike.activeStrikeCountAfterIssue}
                  </strong>
                </div>

                <div>
                  <span>
                    Commission deduction
                  </span>

                  <strong>
                    {selectedStrike.deductionPercentSnapshot}%
                  </strong>
                </div>
              </div>

              <div className="strikes-detail-grid">
                <div>
                  <span>
                    Reason
                  </span>

                  <strong>
                    {selectedStrike.reasonNameSnapshot}
                  </strong>
                </div>

                <div>
                  <span>
                    Issued by
                  </span>

                  <strong>
                    {selectedStrike.issuedByNameSnapshot}
                  </strong>
                </div>

                <div>
                  <span>
                    Issued
                  </span>

                  <strong>
                    {formatCentralDateTime(
                      selectedStrike.issuedAt
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Expires
                  </span>

                  <strong>
                    {formatCentralDateTime(
                      selectedStrike.expiresAt
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Ladder version
                  </span>

                  <strong>
                    v{selectedStrike.ladderVersion}
                  </strong>
                </div>

                <div>
                  <span>
                    Employee record
                  </span>

                  <strong>
                    {selectedStrike.currentUser
                      ? "Current account available"
                      : "Historical snapshot"}
                  </strong>
                </div>
              </div>

              <div className="strikes-detail-section">
                <span>
                  Details
                </span>

                <p>
                  {selectedStrike.details}
                </p>
              </div>

              {selectedStrike.reasonDescriptionSnapshot && (
                <div className="strikes-detail-section">
                  <span>
                    Reason description at issuance
                  </span>

                  <p>
                    {selectedStrike.reasonDescriptionSnapshot}
                  </p>
                </div>
              )}

              {selectedStrike.evidenceUrl && (
                <div className="strikes-detail-section">
                  <span>
                    Evidence
                  </span>

                  <a
                    href={
                      selectedStrike.evidenceUrl
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open evidence link
                  </a>
                </div>
              )}

              {selectedStrike.status ===
                "VOIDED" && (
                <div className="strikes-void-history">
                  <strong>
                    Strike voided
                  </strong>

                  <span>
                    {selectedStrike.voidedAt
                      ? formatCentralDateTime(
                          selectedStrike.voidedAt
                        )
                      : "—"}
                    {selectedStrike.voidedByNameSnapshot
                      ? ` by ${selectedStrike.voidedByNameSnapshot}`
                      : ""}
                  </span>

                  {selectedStrike.voidReason && (
                    <p>
                      {selectedStrike.voidReason}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="strikes-modal-footer">
              {selectedStrike.currentUser &&
                capabilities.canManagePeople && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    openEmployeeStrikeProfile(
                      selectedStrike,
                      true
                    )
                  }
                >
                  View Employee Strikes
                </button>
              )}

              {capabilities.canVoidStrikes &&
                selectedStrike.status !==
                  "VOIDED" &&
                (
                  selectedStrike.currentUser !==
                    null ||
                  capabilities.isOwner
                ) && (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() =>
                      openVoidModal(
                        selectedStrike
                      )
                    }
                  >
                    Void Strike
                  </button>
                )}

              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setSelectedStrike(
                    null
                  )
                }
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {voidTarget && (
        <div
          className="strikes-overlay"
          role="presentation"
        >
          <form
            className="strikes-modal strikes-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="strike-void-title"
            onSubmit={
              submitVoid
            }
          >
            <div className="strikes-modal-header">
              <div>
                <span className="page-eyebrow">
                  Disciplinary correction
                </span>

                <h3 id="strike-void-title">
                  Void Strike?
                </h3>

                <p>
                  The record will remain visible in history but will no longer count as an active Strike.
                </p>
              </div>

              <button
                type="button"
                className="strikes-close"
                aria-label="Close Void Strike"
                disabled={
                  voiding
                }
                onClick={
                  closeVoidModal
                }
              >
                ×
              </button>
            </div>

            <div className="strikes-modal-body">
              <div className="strikes-warning-box">
                <strong>
                  {voidTarget.userNameSnapshot}
                </strong>

                <span>
                  {voidTarget.reasonNameSnapshot} · {voidTarget.standingLabelSnapshot}
                </span>
              </div>

              <label className="form-field">
                <span>
                  Reason for voiding
                </span>

                <textarea
                  rows={
                    4
                  }
                  minLength={
                    3
                  }
                  maxLength={
                    2000
                  }
                  value={
                    voidReason
                  }
                  onChange={(
                    event
                  ) =>
                    setVoidReason(
                      event.target.value
                    )
                  }
                  placeholder="Explain why this Strike is being voided."
                  disabled={
                    voiding
                  }
                  autoFocus
                />
              </label>

              {voidError && (
                <div className="strikes-inline-error">
                  {voidError}
                </div>
              )}
            </div>

            <div className="strikes-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={
                  closeVoidModal
                }
                disabled={
                  voiding
                }
              >
                Cancel
              </button>

              <button
                type="submit"
                className="danger-button"
                disabled={
                  voiding ||
                  voidReason.trim().length <
                    3
                }
              >
                {voiding
                  ? "Voiding…"
                  : "Confirm void"}
              </button>
            </div>
          </form>
        </div>
      )}

      {issueOpen && (
        <div
          className="strikes-overlay"
          role="presentation"
        >
          <form
            className="strikes-modal strikes-issue-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="strike-issue-title"
            onSubmit={
              reviewStrike
            }
          >
            <div className="strikes-modal-header">
              <div>
                <span className="page-eyebrow">
                  Disciplinary action
                </span>

                <h3 id="strike-issue-title">
                  {issueConfirmationOpen
                    ? "Final confirmation"
                    : "Issue Strike"}
                </h3>

                <p>
                  {issueConfirmationOpen
                    ? "Review the exact disciplinary consequence before this Strike is recorded."
                    : issueSourceIncidentId
                      ? "Review the QA-linked disciplinary action and resulting standing before confirming."
                      : "Review the resulting standing before confirming."}
                </p>
              </div>

              <button
                type="button"
                className="strikes-close"
                aria-label="Close Issue Strike"
                disabled={
                  issuing
                }
                onClick={
                  issueConfirmationOpen
                    ? returnToIssueForm
                    : closeIssueModal
                }
              >
                ×
              </button>
            </div>

            <div className="strikes-modal-body">
              {issueConfirmationOpen ? (
                <>
                  <div className="strikes-warning-box">
                    <strong>
                      Final confirmation required
                    </strong>

                    <span>
                      No Strike has been issued yet. Verify these details before recording this disciplinary action.
                    </span>
                  </div>

                  <div className="strikes-detail-grid">
                    <div>
                      <span>
                        Employee
                      </span>

                      <strong>
                        {selectedIssueEmployee?.name ??
                          issuePreview?.user.name ??
                          "—"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Strike reason
                      </span>

                      <strong>
                        {selectedIssueReason?.name ??
                          "—"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Resulting standing
                      </span>

                      <strong>
                        {issuePreview?.standingLabel ??
                          "—"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Commission deduction
                      </span>

                      <strong>
                        {issuePreview
                          ? `${issuePreview.deductionPercent}%`
                          : "—"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Active Strikes after issue
                      </span>

                      <strong>
                        {issuePreview
                          ?.activeStrikeCountAfterIssue ??
                          "—"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Expires
                      </span>

                      <strong>
                        {issuePreview
                          ? formatCentralDateTime(
                              issuePreview.expiresAt
                            )
                          : "—"}
                      </strong>
                    </div>
                  </div>

                  {issueSourceIncidentId && (
                    <div className="strikes-detail-section">
                      <span>
                        Source QA incident
                      </span>

                      <p>
                        {issueSourceIncidentId}
                      </p>
                    </div>
                  )}

                  <div className="strikes-detail-section">
                    <span>
                      Strike details
                    </span>

                    <p>
                      {issueDetails.trim()}
                    </p>
                  </div>

                  {!issueSourceIncidentId &&
                    issueEvidenceUrl.trim() && (
                    <div className="strikes-detail-section">
                      <span>
                        Evidence
                      </span>

                      <p>
                        {issueEvidenceUrl.trim()}
                      </p>
                    </div>
                  )}

                  {issueError && (
                    <div className="strikes-inline-error">
                      {issueError}
                    </div>
                  )}
                </>
              ) : (
                <>
              {issueDataLoading ? (
                <div className="empty-state">
                  <strong>
                    Preparing Strike form…
                  </strong>
                </div>
              ) : (
                <>
                  <div className="strikes-form-grid">
                    {issueSourceIncidentId ? (
                      <label className="form-field">
                        <span>
                          Chatter
                        </span>

                        <input
                          type="text"
                          value={
                            selectedIssueEmployee
                              ? `${selectedIssueEmployee.name} — ${selectedIssueEmployee.email}`
                              : "Linked chatter unavailable"
                          }
                          readOnly
                          aria-readonly="true"
                        />
                      </label>
                    ) : (
                      <label className="form-field">
                        <span>
                          Employee
                        </span>

                        <select
                          value={
                            issueUserId
                          }
                          onChange={(
                            event
                          ) => {
                            void handleIssueUserChange(
                              event.target.value
                            );
                          }}
                          disabled={
                            issuing
                          }
                        >
                          <option value="">
                            Select employee
                          </option>

                          {eligibleUsers.map(
                            (
                              employee
                            ) => (
                              <option
                                key={
                                  employee.id
                                }
                                value={
                                  employee.id
                                }
                              >
                                {employee.name} — {employee.email}
                              </option>
                            )
                          )}
                        </select>
                      </label>
                    )}

                    <label className="form-field">
                      <span>
                        Strike reason
                      </span>

                      <select
                        value={
                          issueReasonId
                        }
                        onChange={(
                          event
                        ) =>
                          setIssueReasonId(
                            event.target.value
                          )
                        }
                        disabled={
                          issuing
                        }
                      >
                        <option value="">
                          Select reason
                        </option>

                        {reasons.map(
                          (
                            reason
                          ) => (
                            <option
                              key={
                                reason.id
                              }
                              value={
                                reason.id
                              }
                            >
                              {reason.name}
                            </option>
                          )
                        )}
                      </select>
                    </label>
                  </div>

                  <label className="form-field">
                    <span>
                      Strike details
                    </span>

                    <textarea
                      rows={
                        5
                      }
                      maxLength={
                        5000
                      }
                      placeholder="Describe the disciplinary basis and relevant context."
                      value={
                        issueDetails
                      }
                      onChange={(
                        event
                      ) =>
                        setIssueDetails(
                          event.target.value
                        )
                      }
                      disabled={
                        issuing
                      }
                    />
                  </label>

                  {!issueSourceIncidentId && (
                    <label className="form-field">
                      <span>
                        Evidence URL
                        <small>
                          Optional
                        </small>
                      </span>

                      <input
                        type="url"
                        placeholder="https://"
                        value={
                          issueEvidenceUrl
                        }
                        onChange={(
                          event
                        ) =>
                          setIssueEvidenceUrl(
                            event.target.value
                          )
                        }
                        disabled={
                          issuing
                        }
                      />
                    </label>
                  )}

                  <div className="strikes-preview">
                    <div className="strikes-preview-header">
                      <div>
                        <span className="page-eyebrow">
                          Consequence preview
                        </span>

                        <strong>
                          Result after issuance
                        </strong>
                      </div>

                      {previewLoading && (
                        <span className="strikes-preview-loading">
                          Calculating…
                        </span>
                      )}
                    </div>

                    {!issueUserId ? (
                      <p className="strikes-preview-empty">
                        Select an employee to calculate their resulting Strike standing.
                      </p>
                    ) : previewLoading ? (
                      <p className="strikes-preview-empty">
                        Checking current active Strikes and ladder state…
                      </p>
                    ) : issuePreview ? (
                      <>
                        <div className="strikes-preview-grid">
                          <div>
                            <span>
                              Current active
                            </span>

                            <strong>
                              {issuePreview.currentActiveStrikeCount}
                            </strong>
                          </div>

                          <div>
                            <span>
                              After issue
                            </span>

                            <strong>
                              {issuePreview.activeStrikeCountAfterIssue}
                            </strong>
                          </div>

                          <div>
                            <span>
                              New standing
                            </span>

                            <strong>
                              {issuePreview.standingLabel}
                            </strong>
                          </div>

                          <div>
                            <span>
                              Deduction
                            </span>

                            <strong>
                              {issuePreview.deductionPercent}%
                            </strong>
                          </div>
                        </div>

                        <div className="strikes-preview-meta">
                          <span>
                            Expires {formatCentralDateTime(
                              issuePreview.expiresAt
                            )}
                          </span>

                          <span>
                            {issuePreview.durationDays}-day window
                          </span>

                          <span>
                            Ladder v{issuePreview.ladderVersion}
                          </span>
                        </div>
                      </>
                    ) : (
                      <p className="strikes-preview-empty">
                        Preview unavailable.
                      </p>
                    )}
                  </div>

                  {issueError && (
                    <div className="strikes-inline-error">
                      {issueError}
                    </div>
                  )}
                </>
              )}

                </>
              )}
            </div>

            <div className="strikes-modal-footer">
              {issueConfirmationOpen ? (
                <>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={
                      returnToIssueForm
                    }
                    disabled={
                      issuing
                    }
                  >
                    Back
                  </button>

                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => {
                      void confirmIssueStrike();
                    }}
                    disabled={
                      issuing
                    }
                  >
                    {issuing
                      ? "Issuing…"
                      : "Issue Strike"}
                  </button>
                </>
              ) : (
                <>
              <button
                type="button"
                className="secondary-button"
                onClick={
                  closeIssueModal
                }
                disabled={
                  issuing
                }
              >
                Cancel
              </button>

              <button
                type="submit"
                className="danger-button"
                disabled={
                  issueDataLoading ||
                  issuing ||
                  previewLoading ||
                  !issueUserId ||
                  !issueReasonId ||
                  !issueDetails.trim() ||
                  !issuePreview ||
                  issuePreview.user.id !==
                    issueUserId
                }
              >
                Review & confirm
              </button>

                </>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default StrikesPage;