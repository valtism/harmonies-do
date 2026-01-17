interface NameSelectProps extends React.ComponentProps<"button"> {
  onNameChange: (name: string) => void;
}
export function NameSelect({ onNameChange, ...props }: NameSelectProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const name = formData.get("name") as string;
        if (!name) return;
        onNameChange(name);
      }}
    >
      <label>
        Name:
        <input
          type="text"
          name="name"
          defaultValue={
            ["Happy", "Brave", "Swift", "Clever", "Calm"][
              Math.floor(Math.random() * 5)
            ] +
            ["Fox", "Bear", "Wolf", "Hawk", "Owl"][
              Math.floor(Math.random() * 5)
            ]
          }
        />
      </label>
      <button type="submit" {...props}>
        Submit
      </button>
    </form>
  );
}
