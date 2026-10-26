import { useEffect, useRef, useState } from "react";
import { GrFormClose } from "react-icons/gr";
import { ToastContainer, toast } from "react-toastify";
import axios from "axios";
import { ChatState } from "../../context/ChatProvider";
import { allUsersRoute, groupChatRoute } from "../../utils/APIRoutes";
import { toastOptions } from "../../utils/constants";
import Avatar from "../Avatar";

function GroupChatCreate({ onClose }) {
  const { user, setChats, setSelectedChat } = ChatState();
  const [name, setName] = useState(""); const [users, setUsers] = useState([]); const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState(""); const [loading, setLoading] = useState(true); const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const submissionInFlight = useRef(false);
  const dialogRef = useRef();
  useEffect(() => { axios.get(allUsersRoute, { headers: { Authorization: `Bearer ${user.token}` } })
    .then(({ data }) => setUsers([...new Map(data.filter((item) => item._id !== user._id).map((item) => [item._id, item])).values()]))
    .catch(() => setLoadError("Unable to load available users. Please close and try again.")).finally(() => setLoading(false)); dialogRef.current?.querySelector(".close-button")?.focus(); }, [user]);
  useEffect(() => { const escape = (event) => event.key === "Escape" && onClose(); window.addEventListener("keydown", escape); return () => window.removeEventListener("keydown", escape); }, [onClose]);
  const toggle = (candidate) => setSelected((current) => current.some((item) => item._id === candidate._id) ? current.filter((item) => item._id !== candidate._id) : [...current, candidate]);
  const submit = async (event) => { event.preventDefault(); if (!name.trim() || !selected.length) return toast.warning("Enter a group name and select at least one member.", toastOptions); if (submissionInFlight.current) return; submissionInFlight.current = true; setSubmitting(true); try { const { data } = await axios.post(groupChatRoute, { name: name.trim(), users: JSON.stringify(selected.map((item) => item._id)) }, { headers: { Authorization: `Bearer ${user.token}` } }); setChats((current) => [data, ...(current || []).filter((chat) => chat._id !== data._id)]); setSelectedChat(data); onClose(); } catch (error) { toast.error(error.response?.data?.message || "Unable to create the group.", toastOptions); } finally { submissionInFlight.current = false; setSubmitting(false); } };
  const visible = users.filter((item) => item.username.toLowerCase().includes(search.toLowerCase()));
  return <div className="create-group modal-wrapper"><section ref={dialogRef} className="modal-container" role="dialog" aria-modal="true" aria-labelledby="create-group-title" onKeyDown={(event) => { if (event.key !== "Tab") return; const controls = dialogRef.current.querySelectorAll("button:not(:disabled), input:not(:disabled)"); const first = controls[0]; const last = controls[controls.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }}><button className="close-button" type="button" onClick={onClose} aria-label="Close"><GrFormClose /></button><div className="modal-header"><h2 id="create-group-title">Create Group Chat</h2></div><form className="modal-content" onSubmit={submit}><label className="group-field">Group name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Group name" /></label><label className="group-field">Search people<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search available users" /></label><div className="selected-summary">{selected.length} member{selected.length === 1 ? "" : "s"} selected</div><div className="group-user-list">{loading ? "Loading users…" : loadError ? <span className="group-error">{loadError}</span> : visible.length ? visible.map((candidate) => { const checked = selected.some((item) => item._id === candidate._id); return <label className={`group-user ${checked ? "selected" : ""}`} key={candidate._id}><Avatar image={candidate.profilePic} alt={candidate.username} /><span>{candidate.username}</span><input type="checkbox" checked={checked} onChange={() => toggle(candidate)} /></label>; }) : "No eligible users found."}</div><button className="button create-group-submit" type="submit" disabled={submitting || loading}>{submitting ? "Creating…" : "Create Group"}</button></form></section><ToastContainer /></div>;
}
export default GroupChatCreate;
