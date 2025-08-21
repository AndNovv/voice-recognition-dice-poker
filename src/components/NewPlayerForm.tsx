import { useState, type FormEvent } from 'react';

interface AddNewPlayerFormProps {
  addPlayer: (name: string) => void;
}

const AddNewPlayerForm = ({ addPlayer }: AddNewPlayerFormProps) => {
  const [playerName, setPlayerName] = useState('');

  const handleOnSubmit = (e: FormEvent) => {
    e.preventDefault();
    addPlayer(playerName);
    setPlayerName('');
  };
  return (
    <div className="bg-white rounded-2xl shadow h-fit p-4">
      <div className="flex flex-col gap-2">
        <label className="font-semibold">Добавить нового игрока</label>
        <form onSubmit={handleOnSubmit} className="flex gap-2">
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Имя игрока"
            className="border rounded-xl px-3 py-2 flex-1"
          />
          <button
            onClick={() => addPlayer(playerName)}
            className="px-4 py-2 rounded-2xl shadow border hover:shadow-md bg-gray-100"
          >
            ➕ Добавить
          </button>
        </form>
      </div>
    </div>
  );
};

export default AddNewPlayerForm;
