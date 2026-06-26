<template>
  <div class="table-responsive" :style="maxHeight ? { maxHeight: maxHeight, overflowY: 'auto' } : {}">
    <table>
      <thead>
        <tr>
          <!-- Header Checkbox para Seleção -->
          <th v-if="selectable" style="width: 40px; text-align: center;">
            <input
              type="checkbox"
              :checked="allSelected"
              @change="toggleSelectAll"
              style="width: 16px; height: 16px; min-height: auto; cursor: pointer; margin: 0; vertical-align: middle;"
            />
          </th>

          <!-- Cabeçalhos das Colunas -->
          <th
            v-for="col in resolvedColumns"
            :key="col.key"
            :class="{ sortable: col.sortable !== false }"
            @click="col.sortable !== false ? sortBy(col.key) : null"
            :style="{
              width: col.width || 'auto',
              textAlign: col.headerAlign || col.align || 'left',
              cursor: col.sortable !== false ? 'pointer' : 'default',
              userSelect: 'none'
            }"
          >
            <div style="display: inline-flex; align-items: center; gap: 4px;">
              <span>{{ col.label || formatLabel(col.key) }}</span>
              <span v-if="col.sortable !== false" style="display: inline-flex; font-size: 14px; color: var(--text-muted);">
                <i v-if="sortKey === col.key && sortDir === 'asc'" class="ri-arrow-up-s-line" style="color: var(--primary-hover);"></i>
                <i v-else-if="sortKey === col.key && sortDir === 'desc'" class="ri-arrow-down-s-line" style="color: var(--primary-hover);"></i>
                <i v-else class="ri-arrow-up-down-line" style="opacity: 0.3;"></i>
              </span>
            </div>
          </th>
        </tr>
      </thead>

      <tbody>
        <tr
          v-for="(row, rIdx) in processedData"
          :key="row[rowKey] !== undefined ? row[rowKey] : rIdx"
          :class="{ 'row-selected': selectable && selectedMap[row[rowKey]] }"
        >
          <!-- Checkbox de Linha para Seleção -->
          <td v-if="selectable" style="text-align: center; vertical-align: middle; width: 40px;">
            <input
              type="checkbox"
              :checked="selectedMap[row[rowKey]] === true"
              @change="toggleRowSelection(row)"
              style="width: 16px; height: 16px; min-height: auto; cursor: pointer; margin: 0; vertical-align: middle;"
            />
          </td>

          <!-- Conteúdo das Células com Slot Customizado ou Fallback de Valor -->
          <td
            v-for="col in resolvedColumns"
            :key="col.key"
            :style="{ textAlign: col.align || 'left' }"
          >
            <slot :name="col.key" :row="row" :value="getValueByPath(row, col.key)">
              {{ getValueByPath(row, col.key) }}
            </slot>
          </td>
        </tr>

        <!-- Linha Vazia (Sem Dados) -->
        <tr v-if="!processedData.length">
          <td :colspan="colspanCount" style="text-align: center; padding: 32px;" class="muted">
            <slot name="empty">
              Nenhum dado encontrado.
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from "vue";

export interface ColumnConfig {
  key: string;
  label?: string;
  sortable?: boolean;
  sortExpression?: (row: any) => any;
  width?: string;
  align?: "left" | "center" | "right";
  headerAlign?: "left" | "center" | "right";
}

export default defineComponent({
  name: "GenericGrid",
  props: {
    data: {
      type: Array as PropType<any[]>,
      required: true,
      default: () => []
    },
    columns: {
      type: Array as PropType<ColumnConfig[]>,
      default: () => []
    },
    autoGenerate: {
      type: Boolean,
      default: false
    },
    rowKey: {
      type: String,
      default: "id"
    },
    selectable: {
      type: Boolean,
      default: false
    },
    selectedMap: {
      type: Object as PropType<Record<string | number, boolean>>,
      default: () => ({})
    },
    maxHeight: {
      type: String,
      required: false,
      default: ""
    }
  },
  emits: ["update:selectedMap"],
  data() {
    return {
      sortKey: null as string | null,
      sortDir: "asc" as "asc" | "desc"
    };
  },
  computed: {
    resolvedColumns(): ColumnConfig[] {
      let cols = [...this.columns];

      if (this.autoGenerate && this.data && this.data.length > 0) {
        const firstItem = this.data[0];
        const declaredKeys = new Set(cols.map((c) => c.key));

        const autoCols = Object.keys(firstItem)
          .filter((key) => !declaredKeys.has(key))
          .map((key) => ({
            key,
            label: this.formatLabel(key),
            sortable: true
          }));

        cols = [...cols, ...autoCols];
      }

      return cols;
    },
    colspanCount(): number {
      let count = this.resolvedColumns.length;
      if (this.selectable) count++;
      return count;
    },
    allSelected(): boolean {
      if (!this.data || !this.data.length) return false;
      return this.data.every((row) => {
        const id = row[this.rowKey];
        return this.selectedMap[id] === true;
      });
    },
    processedData(): any[] {
      const list = [...this.data];
      if (!this.sortKey) return list;

      const key = this.sortKey;
      const dir = this.sortDir === "asc" ? 1 : -1;
      const col = this.resolvedColumns.find((c) => c.key === key);
      const sortExpr = col?.sortExpression;

      list.sort((a, b) => {
        let valA = sortExpr ? sortExpr(a) : this.getValueByPath(a, key);
        let valB = sortExpr ? sortExpr(b) : this.getValueByPath(b, key);

        if (valA === undefined || valA === null) valA = "";
        if (valB === undefined || valB === null) valB = "";

        // Tenta converter em Date
        const dateA = this.parseDate(valA);
        const dateB = this.parseDate(valB);
        if (dateA && dateB) {
          return (dateA.getTime() - dateB.getTime()) * dir;
        }

        // Tenta converter em número
        const numA = typeof valA === "number" ? valA : Number(String(valA).replace(",", "."));
        const numB = typeof valB === "number" ? valB : Number(String(valB).replace(",", "."));
        if (!isNaN(numA) && !isNaN(numB)) {
          return (numA - numB) * dir;
        }

        // Ordena por string locale
        return String(valA).localeCompare(String(valB), undefined, {
          numeric: true,
          sensitivity: "base"
        }) * dir;
      });

      return list;
    }
  },
  methods: {
    sortBy(key: string) {
      if (this.sortKey === key) {
        this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
      } else {
        this.sortKey = key;
        this.sortDir = "asc";
      }
    },
    getValueByPath(obj: any, path: string): any {
      if (!obj || !path) return undefined;
      return path.split(".").reduce((acc, part) => acc && acc[part], obj);
    },
    formatLabel(key: string): string {
      return key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
    },
    parseDate(val: any): Date | null {
      if (val instanceof Date) return val;
      if (typeof val !== "string") return null;
      if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) return d;
      }
      const brMatch = val.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
      if (brMatch) {
        const day = parseInt(brMatch[1], 10);
        const month = parseInt(brMatch[2], 10) - 1;
        const year = parseInt(brMatch[3], 10);
        const d = new Date(year, month, day);
        if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
          return d;
        }
      }
      return null;
    },
    toggleSelectAll(event: Event) {
      const checked = (event.target as HTMLInputElement).checked;
      const newMap = { ...this.selectedMap };
      this.data.forEach((row) => {
        const id = row[this.rowKey];
        newMap[id] = checked;
      });
      this.$emit("update:selectedMap", newMap);
    },
    toggleRowSelection(row: any) {
      const id = row[this.rowKey];
      const newMap = { ...this.selectedMap };
      newMap[id] = !newMap[id];
      this.$emit("update:selectedMap", newMap);
    }
  }
});
</script>

<style scoped>
th.sortable {
  cursor: pointer;
  transition: background-color var(--transition-fast), color var(--transition-fast);
}
th.sortable:hover {
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-highlight);
}
/* Sticky table header when container scrolls vertically */
.table-responsive {
  position: relative;
}
table thead th {
  position: sticky;
  top: 0;
  background: #131b2e; /* matches --bg-panel-solid */
  z-index: 10;
}
</style>
