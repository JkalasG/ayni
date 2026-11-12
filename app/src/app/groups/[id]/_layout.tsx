import { View } from "react-native";
import { Slot, useLocalSearchParams } from "expo-router";
import { GroupNav } from "@/components/group-nav";
import { GroupProvider } from "@/lib/group";
import { useScheme } from "@/lib/scheme";

/** Every screen of a group (summary, turns, guarantee, chat...) under the same top menu, with the group loaded once. */
export default function GroupLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useScheme();
  return (
    <GroupProvider id={id}>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <GroupNav />
        <View style={{ flex: 1 }}>
          <Slot />
        </View>
      </View>
    </GroupProvider>
  );
}
