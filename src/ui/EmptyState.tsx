/** What belongs here and the one action that fills it. */
export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <section className="card empty" aria-labelledby="empty-h">
      <h2 id="empty-h" className="card-h">{title}</h2>
      <p className="note">{body}</p>
      {action}
    </section>
  );
}
