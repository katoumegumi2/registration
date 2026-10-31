<script setup lang="ts">
import SelectInput from "@/components/form/SelectInput.vue";
import TextInput from "@/components/form/TextInput.vue";

defineProps<{ form: Record<string, any>; errors: Record<string, string> }>();
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2">
    <TextInput v-model="form.full_name" label="Nama lengkap" required autocomplete="name" :error="errors.full_name" class="sm:col-span-2" />
    <SelectInput v-model="form.gender" label="Jenis kelamin" required :options="[{ value: 'L', label: 'Laki-laki' }, { value: 'P', label: 'Perempuan' }]" placeholder="Pilih" :error="errors.gender" />
    <TextInput v-model="form.phone" label="No. HP" required type="tel" inputmode="tel" autocomplete="tel" :error="errors.phone" />
    <TextInput v-model="form.birth_place" label="Tempat lahir" required :error="errors.birth_place" />
    <TextInput v-model="form.birth_date" label="Tanggal lahir" required type="date" :error="errors.birth_date" />
    <TextInput v-model="form.address" label="Alamat" required multiline :error="errors.address" class="sm:col-span-2" />
    <TextInput v-model="form.institution" label="Institusi / sekolah" :error="errors.institution" />
    <TextInput v-model="form.education_level" label="Pendidikan terakhir" :error="errors.education_level" />
  </div>
</template>
