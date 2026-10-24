"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { projectHref, type ProjectRef } from "../../../lib/library";
import { ProjectSquare } from "./bits";
import { BoardCount } from "./board";
import { BoardIcon, ProjectsIcon, IssuesIcon } from "./icons";
import { ProfileMenu } from "./profile-menu";

export function Sidebar({
  projects,
  issueCount,
}: {
  projects: (ProjectRef & { count: number })[];
  issueCount: number;
}) {
  const pathname = usePathname();
  const current = (href: string, exact = false) =>
    (exact ? pathname === href : pathname.startsWith(href))
      ? "page"
      : undefined;
  return (
    <aside className="sidebar" aria-label="Workspace">
      <Link href="/" className="workspace-name">
        <span className="logo-mark">M</span>
        muscle memory
      </Link>
      <Link
        className="side-link"
        href="/board"
        aria-current={current("/board")}
      >
        <BoardIcon /> Board <BoardCount />
      </Link>
      <Link
        className="side-link"
        href="/issues"
        aria-current={current("/issues")}
      >
        <IssuesIcon /> Issues <span className="count">{issueCount}</span>
      </Link>
      <Link
        className="side-link"
        href="/projects"
        aria-current={current("/projects", true)}
      >
        <ProjectsIcon /> Projects
      </Link>
      <div className="side-heading">Projects</div>
      {projects.map((project) => (
        <Link
          key={project.slug}
          className="side-link project-link"
          href={projectHref(project)}
          aria-current={current(projectHref(project), true)}
        >
          <ProjectSquare project={project} /> {project.title}
          <span className="key">{project.key}</span>
        </Link>
      ))}
      <div className="spacer" />
      <ProfileMenu />
    </aside>
  );
}
