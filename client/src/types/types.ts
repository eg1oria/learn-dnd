type Task = {
  id: number;
  name: string;
};

type Column = {
  id: number;
  title: string;
  tasks: Task[];
};

type BoardState = {
  columns: Column[];
};
