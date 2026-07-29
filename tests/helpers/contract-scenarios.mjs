/**
 * Collect small, related scenarios under one top-level domain contract.
 *
 * This keeps the suite summary useful without sacrificing scenario names or
 * assertion diagnostics. Both synchronous and asynchronous scenario bodies are
 * supported, and the original AssertionError retains its diff and stack.
 */
export function collectContractScenarios() {
  const scenarios = [];

  return {
    scenario(name, execute) {
      if (typeof name !== "string" || !name.trim()) {
        throw new TypeError("Contract scenarios require a descriptive name.");
      }
      if (typeof execute !== "function") {
        throw new TypeError(`Contract scenario "${name}" requires a function.`);
      }
      scenarios.push({ name, execute });
    },

    register(test, contractName) {
      test(contractName, async () => {
        for (const { name, execute } of scenarios) {
          try {
            await execute();
          } catch (error) {
            if (error instanceof Error) {
              error.message = `[${name}] ${error.message}`;
              error.scenario = name;
            }
            throw error;
          }
        }
      });
    },
  };
}
