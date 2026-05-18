import React from "react";
import ReactDOM from "react-dom/client";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  LogOut,
  Plus,
  Shield
} from "lucide-react";

import { supabase } from "./lib/supabase";

import {
  authSchema,
  loginSchema,
  projectSchema,
  taskSchema,
  type TaskStatus
} from "./lib/validation";

import type {
  Profile,
  Project,
  ProjectMember,
  Task
} from "./types";

// @ts-ignore
import "./styles.css";

type ViewState = {
  sessionUserId: string | null;
  profile: Profile | null;
  projects: Project[];
  selectedProject: Project | null;
  members: ProjectMember[];
  tasks: Task[];
  loading: boolean;
  message: string;
};

const emptyState: ViewState = {
  sessionUserId: null,
  profile: null,
  projects: [],
  selectedProject: null,
  members: [],
  tasks: [],
  loading: false,
  message: ""
};

async function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = 8000
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

function App() {
  const [state, setState] =
    React.useState<ViewState>(emptyState);

  const [authMode, setAuthMode] =
    React.useState<"login" | "signup">(
      "login"
    );

  const isAuthSubmitting = React.useRef(false);  
  // KEEP THIS INSIDE APP()
  const setMessage = (message: string) => {
    setState((current) => ({
      ...current,
      message
    }));

    setTimeout(() => {
      setState((current) => ({
        ...current,
        message: ""
      }));
    }, 3000);
  };

  const loadProjectDetails =
    React.useCallback(
      async (project: Project) => {
        try {
          const [
            {
              data: members,
              error: membersError
            },
            {
              data: tasks,
              error: tasksError
            }
          ] = await withTimeout(
            Promise.all([
              supabase
                .from("project_members")
                .select(
                  `
                project_id,
                user_id,
                role,
                profiles(
                  id,
                  full_name,
                  email
                )
              `
                )
                .eq(
                  "project_id",
                  project.id
                ),

              supabase
                .from("tasks")
                .select(
                  `
                *,
                profiles:assignee_id(
                  id,
                  full_name,
                  email
                )
              `
                )
                .eq(
                  "project_id",
                  project.id
                )
                .order("created_at", {
                  ascending: false
                })
            ]),
            "Loading project"
          );

          if (membersError)
            throw membersError;

          if (tasksError)
            throw tasksError;

          const normalizedMembers =
            (members ?? []).map(
              (member: any) => ({
                ...member,
                profiles:
                  Array.isArray(
                    member.profiles
                  )
                    ? member.profiles[0]
                    : member.profiles
              })
            ) as ProjectMember[];

          const normalizedTasks =
            (tasks ?? []).map(
              (task: any) => ({
                ...task,
                profiles:
                  Array.isArray(
                    task.profiles
                  )
                    ? task.profiles[0]
                    : task.profiles
              })
            ) as Task[];

          setState((current) => ({
            ...current,
            selectedProject: project,
            members:
              normalizedMembers,
            tasks: normalizedTasks
          }));
        } catch (error: any) {
          setMessage(
            error.message ||
              "Could not load project"
          );
        }
      },
      []
    );

  const loadApp =
    React.useCallback(async () => {
      try {
        setState((current) => ({
          ...current,
          loading: true
        }));

        const {
          data: userData,
          error: userError
        } = await supabase.auth.getUser();

        if (userError)
          throw userError;

        const user = userData.user;

        if (!user) {
          setState({
            ...emptyState,
            loading: false
          });

          return;
        }

        const [
          {
            data: profile,
            error: profileError
          },
          {
            data: projects,
            error: projectsError
          }
        ] = await Promise.all([
          supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single(),

          supabase
            .from("projects")
            .select("*")
            .order("created_at", {
              ascending: false
            })
        ]);

        if (profileError)
          throw profileError;

        if (projectsError)
          throw projectsError;

        const selectedProject =
          projects?.[0] ?? null;

        setState((current) => ({
          ...current,
          sessionUserId: user.id,
          profile:
            profile as Profile,
          projects:
            (projects ??
              []) as Project[],
          selectedProject,
          loading: false
        }));

        if (selectedProject) {
          await loadProjectDetails(
            selectedProject
          );
        }
      } catch (error: any) {
        setMessage(
          error.message ||
            "Could not load workspace"
        );

        setState((current) => ({
          ...current,
          loading: false
        }));
      }
    }, [loadProjectDetails]);

  React.useEffect(() => {
    loadApp();

    const { data } =
      supabase.auth.onAuthStateChange(
        (event) => {
          if (
            event === "SIGNED_IN"
          ) {
            loadApp();
          }

          if (
            event === "SIGNED_OUT"
          ) {
            setState(emptyState);
          }
        }
      );

    return () => {
      data.subscription.unsubscribe();
    };
  }, [loadApp]);

  const currentRole =
    state.members.find(
      (member) =>
        member.user_id ===
        state.sessionUserId
    )?.role;

  const isAdmin =
    currentRole === "admin";

  

  async function handleAuth(
  event: React.FormEvent<HTMLFormElement>
) {
  event.preventDefault();

  // 🚨 PREVENT DOUBLE SUBMIT / MULTIPLE REQUESTS
  if (isAuthSubmitting.current) return;
  isAuthSubmitting.current = true;

  const form = new FormData(event.currentTarget);

  const values = {
    fullName: String(
      form.get("fullName") ?? ""
    ).trim(),

    email: String(
      form.get("email") ?? ""
    ).trim(),

    password: String(
      form.get("password") ?? ""
    ).trim()
  };

  const parsed =
    authMode === "signup"
      ? authSchema.safeParse(values)
      : loginSchema.safeParse(values);

  if (!parsed.success) {
    isAuthSubmitting.current = false; // ✅ reset
    return setMessage(
      parsed.error.errors[0].message
    );
  }

  try {
    // ================= SIGNUP =================
    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: {
            full_name: values.fullName
          }
        }
      });

      if (error) {
        // ✅ HANDLE RATE LIMIT ERROR
        if (
          error.message?.toLowerCase().includes("rate limit") ||
          (error as any)?.status === 429 ||
          (error as any)?.code === "over_email_send_rate_limit"
        ) {
          setMessage(
            "Too many signup attempts. Please wait a few minutes before trying again."
          );
          return;
        }

        setMessage(error.message);
        return;
      }

      // SAVE PROFILE IN DATABASE
      if (data.user) {
        const { error: profileError } = await supabase
          .from("profiles")
          .upsert({
            id: data.user.id,
            full_name: values.fullName,
            email: values.email
          });

        if (profileError) {
          console.log(profileError);
        }
      }

      setMessage("Account created successfully. You can now login.");
      setAuthMode("login");
      console.log("SIGNUP TRIGGERED");
      event.currentTarget.reset();
      return;
    }

    // ================= LOGIN =================
    const { error } =
      await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password
      });

    if (error) {
      return setMessage(error.message);
    }

    event.currentTarget.reset();

    await loadApp();
  } catch (error) {
    setMessage(
      error instanceof Error
        ? error.message
        : "Something went wrong"
    );
  } finally {
    // 🚨 ALWAYS RESET LOCK
    isAuthSubmitting.current = false;
  }
}

  

    

  async function createProject(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const form =
      event.currentTarget;

    const formData =
      new FormData(form);

    const parsed =
      projectSchema.safeParse({
        name: String(
          formData.get("name") ??
            ""
        ),

        description: String(
          formData.get(
            "description"
          ) ?? ""
        )
      });

    if (!parsed.success) {
      return setMessage(
        parsed.error.errors[0]
          .message
      );
    }

    const {
      data,
      error
    } = await supabase
      .from("projects")
      .insert(parsed.data)
      .select()
      .single();

    if (error) {
      return setMessage(
        error.message
      );
    }

    const newProject =
      data as Project;

    form.reset();

    setState((current) => ({
      ...current,
      projects: [
        newProject,
        ...current.projects
      ],
      selectedProject:
        newProject,
      tasks: [],
      members: []
    }));

    await loadProjectDetails(
      newProject
    );

    setMessage(
      "Project created successfully"
    );
  }

  async function createTask(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      !state.selectedProject
    ) {
      return;
    }

    const form =
      event.currentTarget;

    const formData =
      new FormData(form);

    const parsed =
      taskSchema.safeParse({
        title: String(
          formData.get("title") ??
            ""
        ),

        description: String(
          formData.get(
            "description"
          ) ?? ""
        ),

        priority: String(
          formData.get(
            "priority"
          ) ?? "medium"
        ),

        assignee_id:
          String(
            formData.get(
              "assignee_id"
            ) || ""
          ) || null,

        due_date:
          String(
            formData.get(
              "due_date"
            ) || ""
          ) || null
      });

    if (!parsed.success) {
      return setMessage(
        parsed.error.errors[0]
          .message
      );
    }

    const {
      data,
      error
    } = await supabase
      .from("tasks")
      .insert({
        ...parsed.data,
        project_id:
          state.selectedProject.id,
        status: "todo"
      })
      .select(
        `
      *,
      profiles:assignee_id(
        id,
        full_name,
        email
      )
    `
      )
      .single();

    if (error) {
      console.error(error);

      return setMessage(
        error.message
      );
    }

    const newTask = {
      ...data,
      profiles:
        Array.isArray(
          data.profiles
        )
          ? data.profiles[0]
          : data.profiles
    } as Task;

    form.reset();

    // INSTANT UI UPDATE
    setState((current) => ({
      ...current,
      tasks: [
        newTask,
        ...current.tasks
      ]
    }));

    setMessage(
      "Task created successfully"
    );
  }

  async function updateStatus(
    task: Task,
    status: TaskStatus
  ) {
    const { error } =
      await supabase
        .from("tasks")
        .update({ status })
        .eq("id", task.id);

    if (error) {
      return setMessage(
        error.message
      );
    }

    // INSTANT UPDATE
    setState((current) => ({
      ...current,
      tasks:
        current.tasks.map(
          (item) =>
            item.id === task.id
              ? {
                  ...item,
                  status
                }
              : item
        )
    }));

    setMessage(
      "Task updated"
    );
  }

  async function deleteTask(
    taskId: string
  ) {
    const { error } =
      await supabase
        .from("tasks")
        .delete()
        .eq("id", taskId);

    if (error) {
      return setMessage(
        error.message
      );
    }

    // INSTANT DELETE
    setState((current) => ({
      ...current,
      tasks:
        current.tasks.filter(
          (task) =>
            task.id !== taskId
        )
    }));

    setMessage(
      "Task deleted"
    );
  }

  if (state.loading) {
    return (
      <main className="centered">
        Loading workspace...
      </main>
    );
  }

  if (!state.sessionUserId) {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <h1>Task Manager</h1>

          <form
            onSubmit={handleAuth}
            className="stack"
          >
            {authMode ===
              "signup" && (
              <input
                name="fullName"
                placeholder="Full name"
              />
            )}

            <input
              name="email"
              type="email"
              placeholder="Email"
            />

            <input
              name="password"
              type="password"
              placeholder="Password"
            />

            <button type="submit">
              {authMode ===
              "signup"
                ? "Create account"
                : "Login"}
            </button>
          </form>

          <button
            className="link-button"
            onClick={() =>
              setAuthMode(
                authMode ===
                  "login"
                  ? "signup"
                  : "login"
              )
            }
          >
            {authMode ===
            "login"
              ? "Need account? Signup"
              : "Already have account? Login"}
          </button>

          {state.message && (
            <p className="notice">
              {state.message}
            </p>
          )}
        </section>
      </main>
    );
  }

  const today = new Date()
    .toISOString()
    .slice(0, 10);

  const metrics = {
    total: state.tasks.length,

    done: state.tasks.filter(
      (task) =>
        task.status === "done"
    ).length,

    active:
      state.tasks.filter(
        (task) =>
          task.status ===
          "in_progress"
      ).length,

    overdue:
      state.tasks.filter(
        (task) =>
          task.due_date &&
          task.due_date <
            today &&
          task.status !==
            "done"
      ).length
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <ClipboardList size={24} />
          <span>
            Task Manager
          </span>
        </div>

        <form
          onSubmit={createProject}
          className="project-form"
        >
          <input
            name="name"
            placeholder="New project"
          />

          <textarea
            name="description"
            placeholder="Description"
          />

          <button type="submit">
            <Plus size={16} />
            Project
          </button>
        </form>

        <nav className="project-list">
          {state.projects.map((project) => (
            <div
              key={project.id}
              className={`project-item ${
                project.id === state.selectedProject?.id
                    ? "active"
                    : ""
              }`}    
            > 
              <button
                className="project-btn"
                onClick={() =>
                  loadProjectDetails(project)
                }
              >
                {project.name}
              </button>
               
              <button 
                className="delete-project-btn"
                onClick={async () => {
                  const confirmDelete =
                    window.confirm(
                      `Delete "${project.name}" project?`
                    );

                  if (!confirmDelete) return;

                  const { error } = await supabase
                     .from("projects")
                     .delete()
                     .eq("id", project.id);

                  if (error) {
                    return setMessage(
                      error.message
                    );
                 }
                 setState((current) => {
                  const updatedProjects =
                    current.projects.filter(
                      (p) =>
                        p.id !== project.id
                    );
                    return {
                      ...current,
                      projects: updatedProjects,
                      selectedProject:
                      updatedProjects[0] || null
                    };
                  });
                }}
              >  
                ✕
              </button>
            </div>
          ))}
        </nav>  

        <button
          className="logout"
          onClick={() =>
            supabase.auth.signOut()
          }
        >
          <LogOut size={16} />
          Sign out
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {currentRole ??
                "member"}
            </p>

            <h1>
              {state
                .selectedProject
                ?.name ??
                "No project"}
            </h1>
          </div>

          <div className="user-pill">
            <Shield size={16} />

            {
              state.profile
                ?.full_name
            }
          </div>
        </header>

        {state.message && (
          <p className="notice">
            {state.message}
          </p>
        )}

        <section className="metrics">
          <Metric
            icon={
              <ClipboardList />
            }
            label="Total"
            value={metrics.total}
          />

          <Metric
            icon={
              <CalendarClock />
            }
            label="In Progress"
            value={metrics.active}
          />

          <Metric
            icon={
              <CheckCircle2 />
            }
            label="Done"
            value={metrics.done}
          />

          <Metric
            icon={
              <CalendarClock />
            }
            label="Overdue"
            value={metrics.overdue}
          />
        </section>

        {state.selectedProject && (
          <section className="content-grid">
            <div className="panel">
              <div className="panel-heading">
                <h2>Tasks</h2>

                <span>
                  {
                    state.tasks
                      .length
                  }{" "}
                  tasks
                </span>
              </div>

              <form
                onSubmit={
                  createTask
                }
                className="task-form"
              >
                <input
                  name="title"
                  placeholder="Task title"
                />

                <textarea
                  name="description"
                  placeholder="Task details"
                />

                <select
                  name="priority"
                  defaultValue="medium"
                >
                  <option value="low">
                    Low
                  </option>

                  <option value="medium">
                    Medium
                  </option>

                  <option value="high">
                    High
                  </option>
                </select>

                <input
                  name="due_date"
                  type="date"
                />

                <button type="submit">
                  <Plus size={16} />
                  Add Task
                </button>
              </form>

              <div className="task-list">
                {state.tasks.length ===
                  0 && (
                  <div className="panel">
                    No tasks yet
                  </div>
                )}

                {state.tasks.map(
                  (task) => (
                    <article
                      key={
                        task.id
                      }
                      className={`task-card priority-${task.priority}`}
                    >
                      <div className="task-top">
                        <div>
                          <h3>
                            {
                              task.title
                            }
                          </h3>

                          <p>
                            {task.description ||
                              "No description"}
                          </p>
                        </div>

                        <div
                          className={`status-badge ${task.status}`}
                        >
                          {task.status ===
                            "todo" &&
                            "🔴 Todo"}

                          {task.status ===
                            "in_progress" &&
                            "🟡 In Progress"}

                          {task.status ===
                            "done" &&
                            "✅ Done"}
                        </div>
                      </div>

                      <div className="task-meta">
                        <span>
                          📅{" "}
                          {task.due_date ||
                            "No due date"}
                        </span>

                        <span>
                          ⚡{" "}
                          {
                            task.priority
                          }
                        </span>
                      </div>

                      <div className="task-actions">
                        <select
                          value={
                            task.status
                          }
                          onChange={(
                            event
                          ) =>
                            updateStatus(
                              task,
                              event
                                .target
                                .value as TaskStatus
                            )
                          }
                        >
                          <option value="todo">
                            Todo
                          </option>

                          <option value="in_progress">
                            In Progress
                          </option>

                          <option value="done">
                            Done
                          </option>
                        </select>

                        <button
                          className="delete-task-btn"
                          onClick={() =>
                            deleteTask(
                              task.id
                            )
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  )
                )}
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function Metric({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="metric">
      {icon}

      <span>{label}</span>

      <strong>{value}</strong>
    </div>
  );
}

ReactDOM.createRoot(
  document.getElementById(
    "root"
  )!
).render(
  
    <App />
  
);