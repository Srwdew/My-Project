export default function BudgetIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    food: "M4 3v6a2 2 0 0 0 4 0V3M6 3v18M14 3v9h5M19 3v18",
    car: "M5 10l2-6h10l2 6M3 10h18v8H3zM6 18v3M18 18v3M6 14h2M16 14h2",
    shopping: "M5 7h14l1 14H4L5 7zM9 7V5a3 3 0 0 1 6 0v2M9 10h.01M15 10h.01",
    game: "M7 7h10c2 0 3 2 4 6l1 5c0 2-2 3-4 1l-3-3H9l-3 3c-2 2-4 1-4-1l1-5c1-4 2-6 4-6zM6 10v5M3.5 12.5h5M16 11h.01M19 14h.01",
    heart:
      "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8M3 12h4l2-4 4 8 2-4h6",
    study: "M2 8l10-5 10 5-10 5L2 8zM6 10v7c4 3 8 3 12 0v-7M22 8v8",
    calendar:
      "M4 5h16v16H4zM8 2v6M16 2v6M4 10h16M8 14h1M12 14h1M16 14h1M8 18h1M12 18h1",
    bell: "M18 8a6 6 0 0 0-12 0c0 8-3 8-3 10h18c0-2-3-2-3-10M10 21h4",
    edit: "M14 5l5 5M4 16L16 4a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
    chevron: "M8 10l4 4 4-4",
    salary: "M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 12h.01M18 12h.01",
    briefcase: "M3 7h18v13H3zM8 7V4h8v3M3 13h18",
    star: "M12 2l3 6.3 7 1-5 4.8 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.8 7-1z",
    gift: "M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8c-2-4-6-4-6-1.5S9 8 12 8zM12 8c2-4 6-4 6-1.5S15 8 12 8z",
  };

  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "more" ? (
        <>
          <circle cx="5" cy="12" r="2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="2" fill="currentColor" stroke="none" />
        </>
      ) : (
        <path d={paths[name] ?? paths.edit} />
      )}
    </svg>
  );
}
