import Avatar from "../Avatar";

const UserListItem = ({ handleFunction, result, actionLabel, onAction, actionDisabled = false }) => {
  return (
    <div className="contact" onClick={handleFunction}>
      <div className="avatar">
        <Avatar
          alt={result.username}
          image={result.profilePic}
        />
      </div>
      <div className="grid-wrapper">
        <div className="contact-header">
          <h4 className="chat-name">{result.username}</h4>
        </div>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          className="contact-action"
          disabled={actionDisabled}
          onClick={(event) => {
            event.stopPropagation();
            onAction();
          }}
        >
          {actionDisabled ? "Updating…" : actionLabel}
        </button>
      )}
    </div>
  );
};

export default UserListItem;

