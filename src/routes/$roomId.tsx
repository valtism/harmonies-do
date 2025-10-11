import { createFileRoute } from "@tanstack/react-router";
import useLocalStorageState from "use-local-storage-state";
import { NameSelect } from "../components/NameSelect";
import { useWebSocket } from "../util/useWebSocket";

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
  const { connect, sendMessage, connectionStatus } = useWebSocket();

  const [user, setUser] = useLocalStorageState<User | null>(`name-${roomId}`, {
    defaultValue: null,
  });

  if (!user)
    return (
      <div>
        <div>Hello from {roomId}!</div>
        <button onClick={connect} disabled={connectionStatus === "connecting"}>
          {connectionStatus === "connected"
            ? "Connected"
            : connectionStatus === "connecting"
              ? "Connecting..."
              : "Connect to Server"}
        </button>
        {connectionStatus === "connected" && (
          <button onClick={() => sendMessage("Hello from client!")}>
            Send Test Message
          </button>
        )}
        <NameSelect
          onNameChange={(name) => setUser({ id: userId, name: name })}
        />
      </div>
    );

  // return <GameSocket roomId={roomId} user={user} />;
  return null;
}
