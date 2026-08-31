import { Button } from "@repo/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<main className="mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center gap-6 px-4">
			<Card>
				<CardHeader>
					<CardTitle>Monorepo Template</CardTitle>
					<CardDescription>
						Components and design tokens come from @repo/ui.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex gap-2">
					<Input placeholder="Account name" />
					<Button>Add</Button>
				</CardContent>
				<CardFooter className="gap-2">
					<Button variant="secondary">Secondary</Button>
					<Button variant="outline">Outline</Button>
					<Button variant="destructive">Destructive</Button>
				</CardFooter>
			</Card>
		</main>
	);
}
