import { Modal } from "./Modal";

export function ResetModal({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      title="Confirm Reset"
      onCancel={onCancel}
      footer={
        <>
          <button
            onClick={onCancel}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            Reset Progress
          </button>
        </>
      }
    >
      <p className="mb-6 text-sm text-gray-600">
        Are you sure you want to reset all your learning progress, including
        unlocked levels? This cannot be undone.
      </p>
    </Modal>
  );
}
