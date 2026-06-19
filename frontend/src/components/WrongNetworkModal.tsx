interface WrongNetworkModalProps {
  isOpen: boolean
  isSwitching: boolean
  onCancel(): void
  onSwitch(): void
}

export function WrongNetworkModal({ isOpen, isSwitching, onCancel, onSwitch }: WrongNetworkModalProps) {
  if (!isOpen) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="wrong-network-title" onClick={(event) => event.stopPropagation()}>
        <span className="eyebrow">Network check</span>
        <h2 id="wrong-network-title">Wrong Network</h2>
        <p>This action requires Base Sepolia.</p>
        <div className="modal-actions">
          <button className="primary-action" type="button" disabled={isSwitching} onClick={onSwitch}>
            {isSwitching ? 'Switching' : 'Switch Network'}
          </button>
          <button className="secondary-action" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
