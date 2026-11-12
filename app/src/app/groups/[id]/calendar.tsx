import { Redirect, useLocalSearchParams } from "expo-router";

/** The payment schedule now lives on the group's summary, in place of the woven grid. Old links still arrive here. */
export default function Calendar() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/groups/${id}`} />;
}
