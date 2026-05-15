import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bgvnrhznitxplyxbyvnc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJndm5yaHpuaXR4cGx5eGJ5dm5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDYyNDU1OSwiZXhwIjoyMDkwMjAwNTU5fQ.WVe8DSrt-lkSMIlXwXur4cfosA0972mCOKGXQBCIyvI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanup() {
  console.log('Fetching inventory items...');
  const { data: items, error } = await supabase
    .from('inventory')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching inventory:', error);
    return;
  }

  console.log(`Found ${items.length} items.`);

  const grouped = new Map();
  for (const item of items) {
    const name = item.name.trim().toLowerCase();
    if (!grouped.has(name)) {
      grouped.set(name, []);
    }
    grouped.get(name).push(item);
  }

  for (const [name, duplicates] of grouped.entries()) {
    if (duplicates.length > 1) {
      console.log(`Merging duplicates for: "${duplicates[0].name}" (${duplicates.length} records)`);
      
      const [keep, ...remove] = duplicates;
      const totalQuantity = duplicates.reduce((sum, d) => sum + (Number(d.quantity) || 0), 0);
      
      console.log(`- Keeping ID: ${keep.id}, setting total quantity to ${totalQuantity}`);
      
      // 1. Update the kept record's quantity
      const { error: updateError } = await supabase
        .from('inventory')
        .update({ quantity: totalQuantity })
        .eq('id', keep.id);
        
      if (updateError) {
        console.error(`  Error updating quantity for ${keep.id}:`, updateError);
        continue;
      }

      // 2. Update foreign keys in auto_replenishment_alerts
      for (const r of remove) {
        const { error: alertError } = await supabase
          .from('auto_replenishment_alerts')
          .update({ inventory_id: keep.id })
          .eq('inventory_id', r.id);
        
        if (alertError) {
          console.error(`  Error updating alerts for ${r.id} -> ${keep.id}:`, alertError);
        }
      }

      // 3. Delete duplicates
      const removeIds = remove.map(r => r.id);
      const { error: deleteError } = await supabase
        .from('inventory')
        .delete()
        .in('id', removeIds);
        
      if (deleteError) {
        console.error(`  Error deleting duplicates ${removeIds.join(', ')}:`, deleteError);
      } else {
        console.log(`  Deleted IDs: ${removeIds.join(', ')}`);
      }
    }
  }

  console.log('Cleanup complete.');
}

cleanup();
