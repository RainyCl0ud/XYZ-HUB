import { Link } from "react-router-dom";

/*
 * Chatters on phones (24 Nov 2026): one row per chatter instead of the
 * three-column table. Each row is a link to the chatter's QA profile.
 */

export type ChatterPhoneItem = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
};

export function ChatterPhoneList<T extends ChatterPhoneItem>({
  chatters,
  profilePath,
  formatAdded,
}: {
  chatters: T[];
  profilePath: (chatter: T) => string;
  formatAdded: (value: string) => string;
}) {
  return (
    <ul className="chatter-phone-list">
      {chatters.map((chatter) => {
        const inactive = chatter.status === "INACTIVE";

        return (
          <li key={chatter.id}>
            <Link
              className={`chatter-phone-row${inactive ? " chatter-phone-row-inactive" : ""}`}
              to={profilePath(chatter)}
            >
              {/* The spaces keep words apart when a screen reader reads the link. */}
              <span className="chatter-phone-row-text">
                <span className="chatter-phone-row-name">{chatter.name}</span>{" "}
                <span className="chatter-phone-row-added">Added {formatAdded(chatter.createdAt)}</span>
              </span>
              {inactive && (
                <>
                  {" "}
                  <span className="chatter-phone-row-tag">Inactive</span>
                </>
              )}
              <span className="chatter-phone-row-chevron" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
