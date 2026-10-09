<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import {
  departureFormValuesFrom,
  hasDepartureDetails,
  validateDepartureForm,
  type DepartureFormValues,
} from '../logic/animal-departure'
import { DEPARTURE_REASONS } from '../schema/animal.schema'
import { useAnimalsStore } from '../store/animals.store'
import { useToday } from '@/core/app-lifecycle/use-today'
import FormChoices from '@/shared/form/FormChoices.vue'
import FormField from '@/shared/form/FormField.vue'
import FormScreen from '@/shared/form/FormScreen.vue'
import { useFormValidation } from '@/shared/form/use-form-validation'
import { returnTo } from '@/shared/utils/return-to'

const props = defineProps<{ id: string }>()

const { t } = useI18n()
const router = useRouter()
const animals = useAnimalsStore()
const { today } = useToday()

const values = ref<DepartureFormValues>({ departureReason: null, departureDate: '' })

const { errors, validate } = useFormValidation(values, (current) =>
  validateDepartureForm(current, today.value),
)

const isSubmitting = ref(false)
const saveFailed = ref(false)
const reasonLabelId = useId()

const animal = computed(() => animals.byId(props.id))

const title = computed(() =>
  animal.value && hasDepartureDetails(animal.value)
    ? t('animals.carnet.unfollowed.editDate')
    : t('animals.carnet.unfollowed.addDate'),
)
const reasons = computed(() =>
  DEPARTURE_REASONS.map((value) => ({ value, label: t(`animals.departure.reasons.${value}`) })),
)
const errorMessage = computed(() => {
  if (animals.hasLoaded && animal.value === null) return t('animals.departure.errors.notFound')
  return saveFailed.value ? t('animals.departure.errors.save') : null
})

watch(
  animal,
  (current, previous) => {
    if (current && !previous) values.value = departureFormValuesFrom(current)
  },
  { immediate: true },
)

watch(
  () => animal.value?.unfollowedOn,
  (unfollowedOn) => {
    if (unfollowedOn === null) backToCarnet()
  },
  { immediate: true },
)

function backToCarnet(): void {
  if (animal.value) animals.select(animal.value.id)
  returnTo(router, { name: 'carnet' })
}

async function submit(): Promise<void> {
  if (isSubmitting.value || !animal.value) return
  const result = validate()
  if (!result.success) return

  isSubmitting.value = true
  saveFailed.value = false
  try {
    await animals.saveDeparture(animal.value.id, result.data)
    backToCarnet()
  } catch {
    saveFailed.value = true
  } finally {
    isSubmitting.value = false
  }
}

onMounted(() => {
  if (!animals.hasLoaded) void animals.load()
})
</script>

<template>
  <FormScreen
    class="animal-departure"
    :title="title"
    :subtitle="animal?.name ?? null"
    :submit-label="t('animals.departure.save')"
    :is-submitting="isSubmitting"
    :disabled="!animal"
    :error-message="errorMessage"
    @cancel="backToCarnet"
    @submit="submit"
  >
    <p v-if="animal" class="animal-departure__lead">
      {{ t('animals.departure.lead', { name: animal.name }) }}
    </p>

    <FormField :label="t('animals.departure.reason')" :label-id="reasonLabelId">
      <FormChoices v-model="values.departureReason" :options="reasons" :label-id="reasonLabelId" />
    </FormField>

    <FormField
      :label="t('animals.departure.date.label')"
      control-id="animal-departure-date"
      :help="t('animals.departure.date.help')"
      :error="errors.departureDate ? t(errors.departureDate) : null"
    >
      <template #default="{ describedby, invalid }">
        <v-text-field
          id="animal-departure-date"
          :model-value="values.departureDate"
          :aria-describedby="describedby"
          :aria-invalid="invalid"
          class="form-field__input form-field__input--date"
          type="date"
          :max="today"
          variant="outlined"
          hide-details
          clearable
          append-inner-icon="ms:calendar_month"
          :error="invalid"
          @update:model-value="values.departureDate = $event ?? ''"
        >
          <template #clear="{ props: clear }">
            <v-icon
              v-bind="clear"
              icon="ms:close"
              role="button"
              :aria-label="t('animals.departure.date.clear')"
            />
          </template>
        </v-text-field>
      </template>
    </FormField>
  </FormScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.animal-departure__lead {
  margin: 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
  line-height: 1.45;
}
</style>
