interface NameSelectProps {
  onNameChange: (name: string) => void;
}
export function NameSelect({ onNameChange }: NameSelectProps) {
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
          defaultValue={Math.floor(Math.random() * 16777215).toString(16)}
        />
      </label>
      <button type="submit">Submit</button>
    </form>
  );
}
