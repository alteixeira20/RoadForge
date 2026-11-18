import { Icon } from '@/components/ui/Icon'

interface TaskClaimRowProps {
  claimer?: string | null
  claimedByMe: boolean
  readOnly: boolean
  canOverride: boolean
  isClaiming: boolean
  onClaim: () => void
  onClaimAction: () => void
}

export function TaskClaimRow({
  claimer,
  claimedByMe,
  readOnly,
  canOverride,
  isClaiming,
  onClaim,
  onClaimAction,
}: TaskClaimRowProps) {
  return (
    <div className="task-claim-row">
      {claimer ? (
        <>
          <span className="claim-status">
            <Icon name="user" size={13} />
            {claimedByMe ? 'Working on this' : `${claimer} is working on this`}
          </span>
          {!readOnly && (claimedByMe || canOverride) && (
            <button
              type="button"
              className="btn sm ghost claim-btn"
              onClick={onClaimAction}
              disabled={isClaiming}
              title={claimedByMe ? 'Stop working on this' : 'Owner override'}
            >
              {claimedByMe ? 'Stop working' : 'Override claim'}
            </button>
          )}
        </>
      ) : (
        !readOnly && (
          <button
            type="button"
            className="btn sm ghost claim-btn"
            onClick={onClaim}
            disabled={isClaiming}
            title="Claim this task as yours"
          >
            <Icon name="user" size={13} /> Work on this
          </button>
        )
      )}
    </div>
  )
}
