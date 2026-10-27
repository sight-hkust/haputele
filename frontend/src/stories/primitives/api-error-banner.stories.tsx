import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { ApiErrorBanner } from "@/components/primitives/error-banner";
import { ApiError } from "@/lib/api";

function RetryHarness(args: ComponentProps<typeof ApiErrorBanner>) {
  const [error, setError] = useState(args.error);
  return (
    <div className="w-full max-w-2xl">
      <ApiErrorBanner
        {...args}
        error={error}
        onRetry={() => {
          args.onRetry?.();
          setError(null);
        }}
      />
    </div>
  );
}
const meta = {
  title: "Primitives/ApiErrorBanner",
  component: ApiErrorBanner,
  tags: ["autodocs"],
  args: {
    error: new ApiError(500, "internal_error", undefined, "storybook-request-002"),
    onRetry: fn(),
    retryLabel: "Try again",
    tone: "rose",
  },
  argTypes: { error: { control: false }, tone: { control: "select", options: ["rose", "amber"] } },
  parameters: {
    controls: { include: ["retryLabel", "tone"] },
    docs: {
      description: {
        component:
          "Curated API error copy with retry. A reference is shown only for an unknown error code or a server 5xx; known client errors omit it. Null errors render nothing. The Retry interaction models the caller clearing its error after recovery, not a network success.",
      },
    },
  },
} satisfies Meta<typeof ApiErrorBanner>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ServerFailure: Story = {};
export const NetworkFailure: Story = { args: { error: new ApiError(0, "network_error") } };
export const KnownClientError: Story = {
  args: { error: new ApiError(403, "forbidden", undefined, "hidden-reference") },
};
export const WithoutRetry: Story = { args: { onRetry: undefined } };
export const NoError: Story = { args: { error: null } };
export const RetryAndClear: Story = {
  render: (args) => <RetryHarness {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("Reference: storybook-request-002");
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
};
