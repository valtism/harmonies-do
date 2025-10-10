import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  // 6 character hex code
  const randomRoomId = Math.floor(Math.random() * 16777215).toString(16);

  const [name, setName] = useState(randomRoomId);

  return (
    <div className="p-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        className="rounded bg-stone-600"
      />
      <Link to="/$roomId" params={{ roomId: name }}>
        Create a game
      </Link>
    </div>
  );
}
