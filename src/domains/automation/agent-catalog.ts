/**
 * @deprecated Compatibility facade. The canonical agent registry owns values,
 * schemas, retry defaults, types and runtime manifests.
 */
export {
  AGENT_ACTIONS,
  AGENT_ACTION_COUNT,
  AGENT_PROVIDERS,
  AGENT_PROVIDER_COUNT,
  APPROVAL_REQUIREMENTS,
  APPROVAL_REQUIREMENT_COUNT,
  DEFAULT_RETRY_POLICY,
  agentActionSchema,
  agentProviderSchema,
  approvalRequirementSchema,
  defaultRetryPolicySchema,
  isAgentAction,
  isAgentProvider,
  isApprovalRequirement,
  type AgentAction,
  type AgentProvider,
  type ApprovalRequirement,
} from "./agent-registry";
