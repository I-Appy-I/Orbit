import { GrFormClose } from "react-icons/gr";

function UserBage({ user, handleFunction, admin, canManage, canRemove, disabled, handleAdmin }) {
    return (
        <div className="user-badge-item">
            {user.username}
            {admin && <span> (Admin)</span>}
            {canRemove && <button disabled={disabled} onClick={handleFunction} aria-label={`Remove ${user.username}`}><GrFormClose /></button>}
            {canManage && <button disabled={disabled} onClick={handleAdmin}>{admin ? "Demote" : "Make admin"}</button>}
        </div>
    );
}

export default UserBage;
