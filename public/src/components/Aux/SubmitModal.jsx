function SubmitModal({ setModalActive, submText, warnText, handleFunction, isSubmitting = false }) {
    return (
        <div className="submit modal-wrapper">
            <div className="modal-container">
                <div className="text">
                    <b>{submText}</b>
                    <span>{warnText}</span>
                </div>
                <div className="buttons">
                    <button
                        type="button"
                        className="button secondary"
                        disabled={isSubmitting}
                        onClick={() => { setModalActive("not") }}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="button danger"
                        disabled={isSubmitting}
                        onClick={handleFunction}>
                        {isSubmitting ? "Working…" : "Confirm"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default SubmitModal;
