export type Profile = {
  id: string;
  full_name: string;
  email: string;
};

export type Project = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
};

export type ProjectMember = {
  project_id: string;
  user_id: string;
  role: "admin" | "member";
  profiles?: Profile;
};

export type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  assignee_id: string | null;
  due_date: string | null;
  created_by: string;
  created_at: string;
  profiles?: Profile | null;
};
