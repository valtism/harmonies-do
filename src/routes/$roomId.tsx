import { createFileRoute } from "@tanstack/react-router";
import useLocalStorageState from "use-local-storage-state";
import { NameSelect } from "../components/NameSelect";
import { GameSocket } from "../components/GameSocket";

export interface User {
  id: string;
  name: string;
}

const userId = crypto.randomUUID();

export const Route = createFileRoute("/$roomId")({
  component: Room,
});

function Room() {
  const { roomId } = Route.useParams();

  const [user, setUser] = useLocalStorageState<User | null>(`name-${roomId}`, {
    defaultValue: null,
  });

  if (!user)
    return (
      <div>
        <div>Hello from {roomId}!</div>
        <NameSelect
          onNameChange={(name) => setUser({ id: userId, name: name })}
        />
      </div>
    );

  return <GameSocket roomId={roomId} user={user} />;
}
